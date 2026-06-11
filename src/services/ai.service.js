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
5. ALLOWED ACTIONS: "click", "fill", "press", "select".
6. ONLY output raw valid JSON. Do not include markdown code fences.

EXAMPLE VALID JSON OUTPUT:
{ "action": "fill", "locator": "#user-name", "value": "standard_user" }

GENERATE THE NEXT STEP NOW:`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); 
    let attempts = 0;

    while (attempts < 2) {
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
                throw new Error(`Agent 2 API Hatası: ${errText}`);
            }

            const data = await response.json();
            const rawOutput = cleanModelOutput(data.message.content);
            
            try {
                const stepJson = JSON.parse(rawOutput);
                if (!stepJson.action) throw new Error("JSON'da action alanı yok.");
                return stepJson; // Başarılıysa doğrudan JS objesi döner
            } catch (parseErr) {
                attempts += 1;
                logInfo('⚠️', `Agent 2 JSON formatını bozdu. Tekrar deneniyor...`);
                if (attempts >= 2) throw new Error(`Agent 2 geçerli JSON üretemedi: ${rawOutput}`);
            }

        } catch (err) {
            clearTimeout(timeout);
            if (err.name === 'AbortError') throw new Error('Agent 2 timeout yedi.');
            throw err;
        }
    }
}

module.exports = { agentPlanTest, agentGetNextStep };