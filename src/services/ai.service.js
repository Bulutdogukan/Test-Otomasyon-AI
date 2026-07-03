const { logInfo, logSuccess } = require('../utils/logger');

function cleanModelOutput(rawText) {
    return rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function isValidTestJSON(text) {
    try {
        const parsed = JSON.parse(cleanModelOutput(text));
        return parsed && (Array.isArray(parsed) || (parsed.tests && Array.isArray(parsed.tests)));
    } catch {
        return false;
    }
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
        if (data.error) throw new Error(`Ollama Hatası: ${data.error}`);
        if (!data.message || typeof data.message.content === 'undefined') {
            throw new Error(`Beklenmeyen API Yanıtı Formatı: ${JSON.stringify(data)}`);
        }

        const output = data.message.content.trim();
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

// Ortak Ollama JSON çağrısı: per-attempt AbortController (Faz 1 düzeltmesi),
// 2 deneme + markdown temizleme + JSON parse. Agent 2 ve Self-Healing paylaşır
// (timeout/retry mantığı tek yerde — ikinci kez kopyalanıp regresyona yol açmaz).
async function requestJsonStep({ systemPrompt, userPrompt, model, apiUrl, timeoutMs = 60000, label = 'Agent' }) {
    let attempts = 0;
    while (attempts < 2) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
            clearTimeout(timeout);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`${label} API Hatası: ${errText}`);
            }

            const data = await response.json();
            const rawOutput = cleanModelOutput(data.message.content);

            try {
                const stepJson = JSON.parse(rawOutput);
                if (!stepJson.action) throw new Error("JSON'da action alanı yok.");
                return stepJson;
            } catch (parseErr) {
                attempts += 1;
                logInfo('⚠️', `${label} JSON formatını bozdu. Tekrar deneniyor...`);
                if (attempts >= 2) throw new Error(`${label} geçerli JSON üretemedi: ${rawOutput}`);
            }
        } catch (err) {
            clearTimeout(timeout);
            if (err.name === 'AbortError') throw new Error(`${label} timeout yedi.`);
            throw err;
        }
    }
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
5. ALLOWED ACTIONS: "click", "fill", "press", "select", "assert".
6. ASSERTIONS (VERIFICATION): A test without verification is worthless. Use "assert" to confirm the outcome of your actions. You SHOULD add at least one "assert" before returning DONE.
   - "visible" -> element is present:  { "action": "assert", "locator": "#title", "assertType": "visible" }
   - "text"    -> element contains text: { "action": "assert", "locator": ".header", "assertType": "text", "expected": "Products" }
   - "value"   -> input holds a value:   { "action": "assert", "locator": "#user-name", "assertType": "value", "expected": "standard_user" }
   - "url"     -> URL contains text (no locator needed): { "action": "assert", "assertType": "url", "expected": "/inventory.html" }
7. ONLY output raw valid JSON. Do not include markdown code fences.

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
4. Keep the SAME "action". Keep a "value" ONLY if the action needs one (fill/select/press).
5. If NO suitable element exists on this screen, return: { "action": "GIVEUP" }
6. ONLY output raw valid JSON. Do not include markdown code fences.

EXAMPLE: { "action": "click", "locator": "#new-login-button" }

RETURN THE CORRECTED STEP NOW:`;

    return requestJsonStep({ systemPrompt, userPrompt, model, apiUrl, timeoutMs: 60000, label: 'Self-Healing' });
}

module.exports = { agentPlanTest, agentGetNextStep, agentHealStep };