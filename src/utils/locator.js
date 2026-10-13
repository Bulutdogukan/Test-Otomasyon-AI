// iframe içindeki elemanlar için locator kodlaması.
// ------------------------------------------------------------------
// Playwright'ın CSS motoru açık (open) shadow DOM'u kendiliğinden deler, ama
// iframe sınırını DELMEZ: iframe içindeki bir elemana page.frameLocator(...)
// zinciriyle ulaşılır. LLM'e tek bir düz metin locator verebilmek için çerçeve
// zinciri locator'ın başına " |> " ayracıyla eklenir:
//
//   "#user"                                  -> ana sayfa
//   "iframe#odeme |> #kart-no"               -> bir iframe içinde
//   "iframe#dis |> iframe[name=\"ic\"] |> #x" -> iç içe iframe
//
// Keşif (orchestrator) resolveLocator ile çalıştırır, derleyici
// locatorExpression ile aynı zinciri koda döker — iki taraf aynı kuralı paylaşır.

const FRAME_SEP = ' |> ';

function splitFrameChain(loc) {
    const parts = String(loc || '').split(FRAME_SEP).map(p => p.trim()).filter(Boolean);
    const selector = parts.pop() || 'body';
    return { frames: parts, selector };
}

function joinFrameChain(frames, selector) {
    return [...frames, selector].join(FRAME_SEP);
}

// Canlı keşifte Playwright Locator nesnesi döndürür.
function resolveLocator(page, loc) {
    const { frames, selector } = splitFrameChain(loc);
    let scope = page;
    for (const f of frames) scope = scope.frameLocator(f);
    return scope.locator(selector);
}

// Derlenen .spec.ts içine yazılacak, tamamen kaçışlanmış ifade.
// LLM çıktısı güvenilmeyen girdidir: her parça JSON.stringify'dan geçer.
function locatorExpression(loc, pageVar = 'page') {
    const { frames, selector } = splitFrameChain(loc);
    return pageVar +
        frames.map(f => `.frameLocator(${JSON.stringify(f)})`).join('') +
        `.locator(${JSON.stringify(selector)})`;
}

module.exports = { FRAME_SEP, splitFrameChain, joinFrameChain, resolveLocator, locatorExpression };
