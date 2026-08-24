const { logInfo, logSuccess } = require('../utils/logger');

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

ONLY output text starting with 'Feature:'.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); 

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
                options: { temperature: 0.0, top_p: 0.1, max_tokens: 700, num_ctx: 4096 }
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
        const output = extractMessageContent(data, 'Agent 1').trim();
        if (!output.startsWith('Feature:')) {
            throw new Error('Agent 1 çıktısı geçerli bir BDD Feature biçiminde değil. Çıktı Feature: ile başlamalı.');
        }

        logSuccess('   📝', `BDD Feature Dosyası Metni Oluşturuldu.`);
        return output;
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            throw new Error('Agent 1 timeout: Ollama 2 dakika içinde yanıt vermedi');
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
async function requestJsonStep({ systemPrompt, userPrompt, model, apiUrl, timeoutMs = 60000, label = 'Agent' }) {
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
                    options: { temperature: 0.0, top_p: 0.1, max_tokens: 300, num_ctx: 4096 }
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
async function agentGetNextStep(testPlan, domData, stepHistory, model, apiUrl) {
    logInfo('🧠', `Agent 2 (Locator): Güncel ekrana bakarak sıradaki hamleyi düşünüyor...`);
    
    const systemPrompt = `You are an Autonomous QA Agent executing a test step-by-step. You CANNOT converse. You ONLY return a SINGLE JSON object.`;
    
    // ⚠️ YENİ: CSS kullanması yönündeki KESİN UYARI
    const userPrompt = `GOAL (TEST PLAN):
${testPlan}

HISTORY (STEPS ALREADY EXECUTED):
${JSON.stringify(stepHistory, null, 2)}

CURRENT SCREEN (ELEMENT DICTIONARY):
${domData}

CRITICAL INSTRUCTIONS:
1. Analyze the GOAL and the HISTORY to understand what needs to be done next.
2. Look at the CURRENT SCREEN dictionary. You MUST return the CSS LOCATOR (the VALUE). NEVER return the descriptive label (the KEY).
   - RIGHT: "#user-name"
   - WRONG: "[Giriş Kutusu] Username"
3. If the GOAL is completely achieved based on the HISTORY and CURRENT SCREEN, return: { "action": "DONE" }
4. Otherwise, return ONLY ONE JSON object for the NEXT immediate step.
5. ALLOWED ACTIONS: "click", "fill", "press", "select", "hover", "dragAndDrop", "assert".
6. ADVANCED ACTIONS:
   - "hover" -> move the mouse over an element: { "action": "hover", "locator": "#menu" }
   - "dragAndDrop" -> drag an element onto another; REQUIRES a "target": { "action": "dragAndDrop", "locator": "#item1", "target": "#slot1" }
   - "press" also supports key combinations: { "action": "press", "value": "Control+A" }
7. ASSERTIONS (VERIFICATION): A test without verification is worthless. Use "assert" to confirm the outcome of your actions. You SHOULD add at least one "assert" before returning DONE.
   - NEVER repeat an assert that already appears in HISTORY. If the goal is verified by a previous assert, return { "action": "DONE" } immediately.
   - "visible" -> element is present:  { "action": "assert", "locator": "#title", "assertType": "visible" }
   - "text"    -> element contains text: { "action": "assert", "locator": ".header", "assertType": "text", "expected": "Products" }
   - "value"   -> input holds a value:   { "action": "assert", "locator": "#user-name", "assertType": "value", "expected": "standard_user" }
   - "url"     -> URL contains text (no locator needed): { "action": "assert", "assertType": "url", "expected": "/inventory.html" }
8. ONLY output raw valid JSON. Do not include markdown code fences.

EXAMPLE VALID JSON OUTPUT:
{ "action": "fill", "locator": "#user-name", "value": "standard_user" }

GENERATE THE NEXT STEP NOW:`;

    // Faz 3: timeout/retry mantığı ortak yardımcıya taşındı.
    return requestJsonStep({ systemPrompt, userPrompt, model, apiUrl, timeoutMs: 60000, label: 'Agent 2' });
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
1. The previous locator did NOT work (element not found or not actionable). The page may have changed.
2. Look at the CURRENT SCREEN and find the BEST element matching the SAME intent as the failed step.
3. Return the CSS LOCATOR (the VALUE in the dictionary). NEVER return the label (the KEY).
4. Keep the SAME "action". Keep "value" only if needed (fill/select/press); keep "target" only for dragAndDrop.
5. If NO suitable element exists on this screen, return: { "action": "GIVEUP" }
6. ONLY output raw valid JSON. Do not include markdown code fences.

EXAMPLE: { "action": "click", "locator": "#new-login-button" }

RETURN THE CORRECTED STEP NOW:`;

    return requestJsonStep({ systemPrompt, userPrompt, model, apiUrl, timeoutMs: 60000, label: 'Self-Healing' });
}

module.exports = { agentPlanTest, agentGetNextStep, agentHealStep };