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
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 dakika timeout

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
                // YENİ: VRAM koruması için num_ctx eklendi
                options: { temperature: 0.0, top_p: 0.1, max_tokens: 700, num_ctx: 8192 }
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

async function agentGenerateJSON(testPlan, domData, model, apiUrl) {
    logInfo('🧠 [3/5]', `Agent 2 (Locator): Key-Value Sözlüğü ile planı eşleştiriyor...`);
    
    const systemPrompt = `You are a strict JSON Compiler. You CANNOT converse. You CANNOT apologize. You ONLY return valid JSON.`;
    
    const userPrompt = `TEST PLAN:
${testPlan}

ELEMENT DICTIONARY:
${domData}

CRITICAL INSTRUCTIONS:
1. MULTI-SCENARIO SUPPORT: The TEST PLAN may contain multiple scenarios. You MUST process each scenario and return them in a "tests" array.
2. STATIC LOCATOR RULE: If the element is in the dictionary, use its CSS Locator (the Value) EXACTLY AS WRITTEN. Do NOT wrap 'text="..."' locators in square brackets!
3. ESCAPE HATCH: If dynamic (next page), use Playwright pseudo-selectors like ":nth-match(a, 1)".
4. ALLOWED ACTIONS: "click", "fill", "press", "select".
5. ONLY output raw valid JSON and do NOT include markdown code fences.

EXAMPLE DICTIONARY:
{
  "[Buton] Giris Yap": "#login-btn",
  "[Giriş Kutusu] Arama": "[placeholder='Ara']"
}

EXAMPLE VALID JSON OUTPUT:
{
  "tests": [
    {
      "title": "Giriş Yapma Senaryosu",
      "steps": [
        { "action": "fill", "locator": "[placeholder='Ara']", "value": "iphone" },
        { "action": "click", "locator": "#login-btn" }
      ]
    },
    {
      "title": "Ürün Seçme Senaryosu",
      "steps": [
        { "action": "click", "locator": ":nth-match(a, 1)" }
      ]
    }
  ]
}

GENERATE JSON FOR THE TEST PLAN NOW:`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 dakika timeout
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
                    // YENİ: VRAM koruması için num_ctx eklendi
                    options: { temperature: 0.0, top_p: 0.1, max_tokens: 900, num_ctx: 8192 }
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Agent 2 API Hatası (HTTP ${response.status}): ${errText}`);
            }

            const data = await response.json();
            if (data.error) throw new Error(`Ollama Hatası: ${data.error}`);
            if (!data.message || typeof data.message.content === 'undefined') {
                throw new Error(`Beklenmeyen API Yanıtı Formatı: ${JSON.stringify(data)}`);
            }

            const rawOutput = data.message.content;
            if (!isValidTestJSON(rawOutput)) {
                attempts += 1;
                if (attempts >= 2) {
                    throw new Error('Agent 2 çıktısı geçerli JSON formatında değil. Çıktı:\n' + rawOutput);
                }
                logInfo('⚠️', `Agent 2 çıktısı doğrulanamadı. Tekrar deneniyor (${attempts + 1}/2)...`);
                continue;
            }

            return rawOutput;
        } catch (err) {
            clearTimeout(timeout);
            if (err.name === 'AbortError') {
                throw new Error('Agent 2 timeout: Ollama 2 dakika içinde yanıt vermedi');
            }
            throw err;
        }
    }
}

module.exports = { agentPlanTest, agentGenerateJSON };