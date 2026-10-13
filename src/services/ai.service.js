const { logInfo, logSuccess } = require('../utils/logger');
const { listSecretNames, placeholderFor } = require('../utils/secrets');

// Model bağlam penceresi (token). Ollama bu sınırı aşan prompt'u HATA VERMEDEN
// baştan kırpar — sistem talimatları sessizce kaybolur. 60 eleman + plan + geçmiş
// için 8192 güvenli bir varsayılandır; daha az RAM'li makinede düşürülebilir.
const NUM_CTX = parseInt(process.env.OLLAMA_NUM_CTX, 10) || 8192;
// Tek bir LLM çağrısının azami süresi. GPU'suz makinede 7B model uzun bir DOM
// prompt'unu 60 sn'de işleyemeyebilir; varsayılan bu yüzden 120 sn.
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 120000;
// LLM'e gönderilen adım geçmişi bu sayıyla sınırlanır (bağlam taşmasını önler).
const MAX_HISTORY_IN_PROMPT = 12;

// Prompt'a eklenen gizli veri talimatı. LLM yalnızca yer tutucuyu görür, değeri asla.
function secretsInstruction() {
    const names = listSecretNames();
    if (names.length === 0) return '';
    return `\nSECRET TEST DATA: These placeholders are available. When a step needs one of these values ` +
        `(password, PIN, etc.), use the placeholder EXACTLY as the "value": ${names.map(placeholderFor).join(', ')}\n`;
}

function historyForPrompt(stepHistory) {
    if (stepHistory.length <= MAX_HISTORY_IN_PROMPT) return JSON.stringify(stepHistory, null, 2);
    const omitted = stepHistory.length - MAX_HISTORY_IN_PROMPT;
    return `(${omitted} earlier steps omitted)\n` + JSON.stringify(stepHistory.slice(-MAX_HISTORY_IN_PROMPT), null, 2);
}

function cleanModelOutput(rawText) {
    // ⚠️ DÜZELTME: Önce metin içindeki JSON nesnesini bul (LLM çoğu zaman
    // açıklama metni + JSON karışık döndürür). Eşleşme olursa doğrudan al;
    // yoksa eski yöntemle markdown fence'leri soy.
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0].trim();
    return rawText.replace(/```(?:json)?/gi, '').trim();
}

async function agentPlanTest(userScenario, model, apiUrl) {
    logInfo('🧠 [2/5]', `Agent 1 (Planner): Senaryoyu BDD Gherkin formatına çeviriyor...`);
    
    const systemPrompt = `You are a strict Senior QA BDD Gherkin generator. Do NOT converse. Do NOT apologize.

CRITICAL BDD RULES:
1. NEVER use silly literal translations for BDD keywords (e.g., DO NOT use "Verildiğinde" or "Ne zaman").
2. ALWAYS use standard global BDD keywords: "Feature:", "Scenario:", "Given", "When", "Then", "And".
3. The descriptive sentences after the keywords MUST be in professional Turkish.
4. If the user input is already formatted in BDD, just refine the sentences and keep the structure.
5. Keep every concrete value from the input (usernames, product names, expected texts, URLs) EXACTLY as written.
   Placeholders like {{QA_SECRET_PASSWORD}} or RANDOM_EMAIL MUST be copied character-for-character.
6. Every scenario MUST end with at least one "Then" step that states a verifiable outcome.

ONLY output text starting with 'Feature:'.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Raw Scenario: ${userScenario}` }
                ],
                stream: false,
                // Ollama'da çıktı sınırı "num_predict"tir ("max_tokens" yok sayılır).
                options: { temperature: 0.0, top_p: 0.1, num_predict: 700, num_ctx: NUM_CTX }
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Agent 1 API Hatası (HTTP ${response.status}): ${errText}`);
        }

        const data = await response.json();
        // Hata gövdesi / eksik alan kontrolü requestJsonStep ile aynı yardımcıdan geçer.
        const raw = extractMessageContent(data, 'Agent 1');
        // Küçük modeller çıktıyı ```gherkin bloğuna sarabiliyor veya önüne bir cümle
        // ekleyebiliyor; "Feature:" satırından itibaren alınır, kapanış çiti atılır.
        const featureIdx = raw.indexOf('Feature:');
        if (featureIdx === -1) {
            throw new Error('Agent 1 çıktısı geçerli bir BDD Feature biçiminde değil (Feature: bulunamadı).');
        }
        const output = raw.slice(featureIdx).replace(/```[\s\S]*$/, '').trim();

        logSuccess('   📝', `BDD Feature Dosyası Metni Oluşturuldu.`);
        return output;
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            throw new Error(`Agent 1 timeout: Ollama ${LLM_TIMEOUT_MS / 1000} sn içinde yanıt vermedi (LLM_TIMEOUT_MS).`);
        }
        throw err;
    }
}

// Ollama, model bulunamadığında / yüklenemediğinde HTTP 200 + { error: "..." }
// dönebilir. Bu gövde doğrulanmadan data.message.content okunursa ham bir
// "Cannot read properties of undefined" TypeError'ı patlar ve kullanıcı asıl
// nedeni (örn. "model 'qwen2.5-coder:32b' not found") hiç göremez.
function extractMessageContent(data, label) {
    if (data && data.error) {
        const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        throw new Error(`${label} — Ollama hatası: ${detail}`);
    }
    if (!data || !data.message || typeof data.message.content !== 'string') {
        throw new Error(`${label} — Beklenmeyen API yanıtı formatı: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return data.message.content;
}

// Ortak Ollama JSON çağrısı: per-attempt AbortController (Faz 1 düzeltmesi),
// 2 deneme + markdown temizleme + JSON parse. Agent 2 ve Self-Healing paylaşır
// (timeout/retry mantığı tek yerde — ikinci kez kopyalanıp regresyona yol açmaz).
async function requestJsonStep({ systemPrompt, userPrompt, model, apiUrl, timeoutMs = LLM_TIMEOUT_MS, label = 'Agent' }) {
    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        let rawOutput;
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    stream: false,
                    // format: 'json' Ollama'yı geçerli JSON üretmeye zorlar (küçük modellerde
                    // açıklama metni / bozuk JSON oranını ciddi biçimde düşürür).
                    format: 'json',
                    options: { temperature: 0.0, top_p: 0.1, num_predict: 300, num_ctx: NUM_CTX }
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`${label} API Hatası (HTTP ${response.status}): ${errText.slice(0, 300)}`);
            }

            const data = await response.json();
            // ⚠️ DÜZELTME: Ollama'nın hata gövdesi artık JSON parse denemesinden ÖNCE
            // yakalanıyor. Bu tür hatalar tekrar denemeyle düzelmez, o yüzden fırlatılır.
            rawOutput = cleanModelOutput(extractMessageContent(data, label));
        } catch (err) {
            if (err.name === 'AbortError') throw new Error(`${label} timeout yedi (${timeoutMs / 1000} sn).`);
            throw err;
        } finally {
            clearTimeout(timeout);
        }

        // Buradan sonrası SADECE model çıktısının biçim hatası — tekrar denemeye değer.
        try {
            const stepJson = JSON.parse(rawOutput);
            if (!stepJson || typeof stepJson !== 'object' || Array.isArray(stepJson)) {
                throw new Error('Yanıt tek bir JSON nesnesi değil.');
            }
            if (typeof stepJson.action !== 'string' || !stepJson.action.trim()) {
                throw new Error("JSON'da geçerli bir action alanı yok.");
            }
            return stepJson;
        } catch (parseErr) {
            if (attempt >= MAX_ATTEMPTS) {
                throw new Error(`${label} geçerli JSON üretemedi (${parseErr.message}): ${rawOutput.slice(0, 300)}`);
            }
            logInfo('⚠️', `${label} JSON formatını bozdu. Tekrar deneniyor... (${attempt}/${MAX_ATTEMPTS})`);
        }
    }

    // Döngü buraya asla düşmemeli; yine de sessizce undefined dönmesin.
    throw new Error(`${label} geçerli bir adım üretemedi.`);
}

// YENİ MİMARİ: Adım Adım Düşünen Otonom Ajan
// hint: orchestrator'ın modele ek uyarısı (örn. doğrulamasız DONE denemesi).
// pageInfo: { url, title } — model sayfanın değişip değişmediğini (örn. giriş sonrası) buradan anlar.
async function agentGetNextStep(testPlan, domData, stepHistory, model, apiUrl, hint = null, pageInfo = null) {
    logInfo('🧠', `Agent 2 (Locator): Güncel ekrana bakarak sıradaki hamleyi düşünüyor...`);
    
    const systemPrompt = `You are an Autonomous QA Agent executing a test step-by-step. You CANNOT converse. You ONLY return a SINGLE JSON object.`;
    
    // ⚠️ YENİ: CSS kullanması yönündeki KESİN UYARI
    const userPrompt = `GOAL (TEST PLAN):
${testPlan}

HISTORY (STEPS ALREADY EXECUTED):
${historyForPrompt(stepHistory)}

${pageInfo ? `CURRENT PAGE: ${pageInfo.url}${pageInfo.title ? ` (title: ${pageInfo.title})` : ''}

` : ''}CURRENT SCREEN (ELEMENT DICTIONARY):
${domData}

CRITICAL INSTRUCTIONS:
1. Analyze the GOAL and the HISTORY to understand what needs to be done next.
2. Look at the CURRENT SCREEN dictionary. Use ONLY elements that exist in it. You MUST return the CSS LOCATOR (the VALUE). NEVER return the descriptive label (the KEY).
   - RIGHT: "#user-name"
   - WRONG: "[Giriş Kutusu] Username"
   Some locators contain " |> " (the element is inside an iframe). Copy such locators EXACTLY, including that part.
   Each KEY starts with the element type. Interact (click/fill/select) ONLY with [Buton], [Link], [Giriş Kutusu],
   [Şifre Kutusu], [Açılır Liste], [Seçim Kutusu]. [Başlık], [Uyarı] and [Bölüm] are page sections: use them ONLY in "assert".
3. If the GOAL is completely achieved based on the HISTORY and CURRENT SCREEN, return: { "action": "DONE" }
4. Otherwise, return ONLY ONE JSON object for the NEXT immediate step.
5. ALLOWED ACTIONS: "click", "fill", "press", "select", "hover", "dragAndDrop", "assert".
6. ADVANCED ACTIONS:
   - "hover" -> move the mouse over an element: { "action": "hover", "locator": "#menu" }
   - "dragAndDrop" -> drag an element onto another; REQUIRES a "target": { "action": "dragAndDrop", "locator": "#item1", "target": "#slot1" }
   - "press" also supports key combinations: { "action": "press", "value": "Control+A" }
   - If a form needs a NEW, unique e-mail address (e.g. registration), use the value "RANDOM_EMAIL".
7. ASSERTIONS (VERIFICATION): A test without verification is worthless. Use "assert" to confirm the outcome of your actions. You MUST add at least one "assert" that verifies the final outcome before returning DONE.
   - NEVER repeat an assert that already appears in HISTORY. If the goal is verified by a previous assert, return { "action": "DONE" } immediately.
   - Each assert in HISTORY has "passed": true/false. When the assert for the FINAL expected outcome has "passed": true, return { "action": "DONE" }.
   - NEVER redo steps that are already in HISTORY; the scenario runs only once.
   - "visible" -> element is present:  { "action": "assert", "locator": "#title", "assertType": "visible" }
   - "text"    -> element contains text: { "action": "assert", "locator": ".header", "assertType": "text", "expected": "Products" }
   - "value"   -> input holds a value:   { "action": "assert", "locator": "#user-name", "assertType": "value", "expected": "standard_user" }
   - "url"     -> URL contains text (no locator needed): { "action": "assert", "assertType": "url", "expected": "/inventory.html" }
8. ONLY output raw valid JSON. Do not include markdown code fences.
${secretsInstruction()}
EXAMPLE VALID JSON OUTPUT:
{ "action": "fill", "locator": "#user-name", "value": "standard_user" }
${hint ? `\nIMPORTANT: ${hint}\n` : ''}
GENERATE THE NEXT STEP NOW:`;

    // Faz 3: timeout/retry mantığı ortak yardımcıya taşındı.
    return requestJsonStep({ systemPrompt, userPrompt, model, apiUrl, label: 'Agent 2' });
}

// ⚡ FAZ 3: SELF-HEALING AJANI
// Bir locator başarısız olunca, TAZE DOM ile aynı niyete uyan alternatif locator üretir.
// "Sabit text-fallback" yerine adaptif, LLM-akıl yürütmeli kurtarma.
async function agentHealStep(testPlan, failedStep, reason, domData, model, apiUrl) {
    logInfo('🩹', `Self-Healing: Kırık locator için alternatif aranıyor...`);

    const systemPrompt = `You are a Self-Healing QA Agent. A previous locator FAILED. You CANNOT converse. You ONLY return a SINGLE JSON object containing a corrected step.`;

    const userPrompt = `GOAL (TEST PLAN):
${testPlan}

THE STEP THAT FAILED:
${JSON.stringify(failedStep)}

REASON IT FAILED:
${reason}

CURRENT SCREEN (FRESH ELEMENT DICTIONARY):
${domData}

CRITICAL INSTRUCTIONS:
1. The previous locator did NOT work (element not found or not actionable). The page may have changed. NEVER return that same locator again.
2. Look at the CURRENT SCREEN and find the BEST element matching the SAME intent as the failed step.
3. Return the CSS LOCATOR (the VALUE in the dictionary). NEVER return the label (the KEY). Copy locators containing " |> " exactly.
4. Keep the SAME "action". Keep "value" only if needed (fill/select/press); keep "target" only for dragAndDrop.
5. If NO suitable element exists on this screen, return: { "action": "GIVEUP" }
6. ONLY output raw valid JSON. Do not include markdown code fences.
${secretsInstruction()}
EXAMPLE: { "action": "click", "locator": "#new-login-button" }

RETURN THE CORRECTED STEP NOW:`;

    return requestJsonStep({ systemPrompt, userPrompt, model, apiUrl, label: 'Self-Healing' });
}

module.exports = { agentPlanTest, agentGetNextStep, agentHealStep };