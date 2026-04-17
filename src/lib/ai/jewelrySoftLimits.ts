/**
 * 珠宝图生成的「软限制」：通过 Prompt 拼接提高可生产性与电商主图质量。
 * Gemini / 老张图接口无独立 negative prompt 字段，负面约束以英文段落形式写入正文。
 */

export type JewelryProductKind = "ring" | "pendant";
export type PromptExpansionStrength = "standard" | "strong";

/** 与 generate-main 一致：含吊坠/项链语义时按 pendant，否则 ring */
export function inferJewelryProductKind(prompt: string): JewelryProductKind {
  const pl = prompt.toLowerCase();
  if (
    /(pendant|necklace|charm|bail|hanging loop|hanger|locket|amulet|chain|链条|吊坠|项链)/.test(
      pl
    )
  ) {
    return "pendant";
  }
  return "ring";
}

/**
 * Step3 后视图：用户若已在 prompt 中明确描述吊坠/项链背面/后视造型（含镂空背、透底、背面雕刻等），
 * 则不自动附加默认「实心封底」硬约束，避免覆盖用户意图。
 */
export function userSpecifiedPendantOrNecklaceRearDetail(prompt: string): boolean {
  const t = prompt.trim();
  if (!t) return false;
  const pl = t.toLowerCase();

  if (
    /(镂空背|透底|开窗背|背面镂空|反面镂空|背透|open[\s_-]*back|hollow[\s_-]*back|openwork[\s_-]*back|see[\s-]*through[\s_-]*back|pierced[\s_-]*back|lattice[\s_-]*back|cage[\s_-]*back|mesh[\s_-]*back|open[\s_-]*back[\s_-]*setting)/i.test(
      pl
    )
  ) {
    return true;
  }

  const rearCue = /(背面|反面|后视图|后侧|后壁|背部|rear\s*view|back\s*view|back\s*plate|back\s*of|underside|reverse\s+side)/i.test(
    t
  );
  if (!rearCue) return false;

  return /(镂空|透|开洞|开窗|网格|孔洞|雕刻|纹样|纹理|浮雕|字|铭|图案|造型|结构|hollow|openwork|pierced|cage|lattice|mesh|engrav|pattern|texture|design|slot|perforat)/i.test(
    t
  );
}

/**
 * Step3 吊坠/项链后视图：无用户自定义背面描述时，用「几何结构补全 / 工业建模」约束（英文进 img2img）。
 * 与旧版「整块光滑封底板」不同：背面须有与正面体量匹配的深度与细节，禁止图3式空白大平面。
 */
export function buildPendantRearViewDefaultSolidBackBlock(): string {
  return [
    "PENDANT / NECKLACE — REAR (BACK) VIEW: INDUSTRIAL GEOMETRY COMPLETION (strict): user text did NOT specify custom rear/back detailing; perform **geometric structure completion** as in jewelry CAD / cast modeling.",
    "MENTAL MODEL: imagine a **solid metal blank** that was **machined / cast / engraved away** — front bosses (feathers, faces, bezels, filigree) imply **matched wall thickness, inner ribs, stepped relief, and symmetry** on the reverse. The piece must read as **hand-rotatable 360° jewelry** with no \"paper back\".",
    "POSITIVE (rear — forward constraints): **back view of the pendant**; **full 3D solid structure**; **complete details on the back**; **symmetrical design** when the front motif is symmetric; **complex coherent geometry matching the front silhouette**; **industrial jewelry modeling standard**; **solid metal casting read**; **deep relief** on the reverse; **realistic silver (or user-alloy) texture** with controlled oxidation in recesses; **intricate reverse-side detail** — panel seams, structural webs, gem-seat backs, quill-backs of feathers, under-gallery struts as appropriate.",
    "FORBID (rear — negative constraints): **flat back**, **empty back**, **smooth featureless slab**, **2D-only relief**, **paper-thin sheet**, **missing structural detail**, **simplified placeholder geometry**, **only outline silhouette** with no believable Z-depth.",
    "OPACITY / NO X-RAY: remain **opaque solid metal** — do NOT render a transparent \"window\" into the front motif or stones from behind; no magic see-through of the front design through solid metal.",
    "WEARABILITY: avoid toy-like **random sieve perforations** across the whole rear that would break skin contact; pierced/openwork rear ONLY if the user prompt clearly requests it.",
    "BAIL / HARDWARE on rear: show believable **solid posts, junctions, and inner loop paths** — never delete or seal shut the functional bail.",
    "QUALITY BAR: match **high-end CAD reverse completion** (comparable to pro 3D jewelry tools auto-completing a back view) — the reverse must feel **authored and manufacturable**, not a rushed flat fill.",
  ].join("\n");
}

/** 代码层关键词补强（追加在用户原始 prompt 末尾） */
export function appendKeywordBoosters(prompt: string): string {
  const pl = prompt.toLowerCase();
  const parts: string[] = [];
  if (/\bring\b|rings|戒指/.test(pl)) {
    parts.push("ring shape, circular band, jewelry loop");
  }
  if (/necklace|pendant|chain|链条|吊坠|项链/.test(pl)) {
    // Step1（generate-main）针对吊坠：只强调吊坠本体 + bail，不出现链条，避免每次生成链条风格不同
    parts.push("pendant shape, bail, hanging loop");
  }
  if (!parts.length) return "";
  return ", " + parts.join(", ");
}

/**
 * Step1：给 nano-banana-pro 一段更“像珠宝设计师”的英语扩写，
 * 在不改变用户核心意图前提下补全材质、工艺、镶嵌、风格语义。
 */
export function buildNanoBananaPromptExpansion(
  prompt: string,
  strength: PromptExpansionStrength = "standard"
): string {
  const p = prompt.trim();
  if (!p) return "";

  const pl = p.toLowerCase();
  const kind = /(pendant|necklace|charm|bail|吊坠|项链|链坠)/i.test(pl) ? "pendant" : "ring";
  const is925 = /(925|sterling silver|sterling|925银)/i.test(p);
  const hammered = /(hammered|锤纹|手工锤纹)/i.test(p);
  const gems = /(宝石|gem|gemstone|amethyst|spinel|ruby|sapphire|moonstone|石)/i.test(p);
  const filigree = /(雕花|花丝|engrave|engraving|filigree|carving)/i.test(p);

  // 风格词只做“提示”，不强制覆盖用户主体意图
  const styleHints: string[] = [];
  if (/(mystic|mysticism|神秘主义|符文|lunar|ritual|occult)/i.test(p)) styleHints.push("mystic");
  if (/(gothic|暗黑|哥特)/i.test(p)) styleHints.push("gothic");
  if (/(art nouveau|新艺术)/i.test(p)) styleHints.push("art nouveau");
  if (/(art deco|装饰艺术)/i.test(p)) styleHints.push("art deco");
  if (/(minimal|极简)/i.test(p)) styleHints.push("minimal");
  if (/(vintage|antique|复古)/i.test(p)) styleHints.push("vintage");
  if (/(cyberpunk|赛博朋克|futur|未来)/i.test(p)) styleHints.push("futuristic");
  if (/(nature|botanical|floral|自然|植物|花)/i.test(p)) styleHints.push("nature");

  const lines: string[] = [
    "Expanded jewelry-creative direction for Nano Banana Pro (style-adaptive, do not override user intent):",
    "First infer the user's style DNA from the prompt, then enrich the concept with jewelry-native creative details while preserving the exact core subject and composition intent.",
    `Design target: ${
      kind === "ring" ? "a manufacturable high-end ring" : "a manufacturable high-end pendant"
    } with believable 3D structure, clear hierarchy (hero motif + supporting ornaments), and wearable proportions.`,
    `Material baseline: ${is925 ? "925 sterling silver" : "premium jewelry metal"} with realistic micro-reflections, clean finish, and production-grade polish/oxidation control.`,
    "Creative expansion method (strict): add 3-6 style-consistent details in these domains only — metal surface treatment, edge rhythm, relief layering depth, gemstone setting logic, symbolic micro-motifs, and silhouette flow.",
    "Do NOT change the user's requested main subject/category. Do NOT replace creature/theme. Innovate around craftsmanship vocabulary, not around product identity.",
    "Manufacturing realism: every decorative element must look physically buildable (cast/engraved/stone-set), with credible thickness, transitions, and attachment points.",
  ];

  if (styleHints.length) {
    lines.push(`Detected style hints: ${styleHints.join(", ")}. Keep expansion consistent with these cues.`);
  }
  if (hammered) {
    lines.push(
      "If hammered texture is requested: show intentional hand-hammer marks with controlled highlight breakup, not random noise."
    );
  }
  if (gems) {
    lines.push(
      "If gemstones are present: use believable prong/bezel seating and coherent gemstone color story; avoid floating or physically impossible stones."
    );
  }
  if (filigree) {
    lines.push(
      "If filigree/engraving is requested: keep ornamental rhythm readable, with clear primary-secondary pattern hierarchy."
    );
  }
  lines.push(
    "Render intent: premium e-commerce jewelry photo quality — sharp details, realistic metal/specular behavior, and clear focal narrative."
  );
  // 2026-04: 当前“标准扩写”即采用原强创意规则版，提升基础出图补强能力。
  // “强创意”模式将由外部 AI 改写接口提供（在 generate-main 中调用），此处作为统一规则回退。
  lines.push(
    "Increase creative specificity while preserving the same core subject — add richer but style-consistent micro-details in silhouette transitions, relief rhythm, and ornament hierarchy."
  );
  lines.push(
    "When multiple coherent options exist, choose the most visually distinctive premium-jewelry interpretation that still remains manufacturable and faithful to user intent."
  );

  return lines.join(" ");
}

/** 从提示词括号内 A/B/C、A、B 等拆出候选主体词，供批量生图轮换 */
export function extractMotifAlternativesFromPrompt(prompt: string): string[] {
  const seen = new Set<string>();
  const normalize = (raw: string) =>
    raw
      .trim()
      .replace(/^(?:等|如|例如|比如)\s*/u, "")
      .replace(/等[\s\S]*$/u, "")
      .replace(/可爱动物$/u, "")
      .trim();

  const add = (raw: string) => {
    const t = normalize(raw);
    if (t.length >= 1 && t.length <= 24) seen.add(t);
  };

  const bracketRe = /[（(]([^）)]+)[）)]/g;
  let bm: RegExpExecArray | null;
  while ((bm = bracketRe.exec(prompt)) !== null) {
    const inner = bm[1];
    if (!/[\/／、|｜]/.test(inner)) continue;
    for (const part of inner.split(/[\/／、|｜]/)) add(part);
  }

  const flatSlash = prompt.match(/[\u4e00-\u9fffA-Za-z·]+(?:\/[\u4e00-\u9fffA-Za-z·]+)+/g);
  if (flatSlash) {
    for (const chunk of flatSlash) {
      if (!/[\/／]/.test(chunk)) continue;
      for (const part of chunk.split(/[\/／]/)) add(part);
    }
  }

  return Array.from(seen);
}

/** Step1 一次生成多张时：避免每张都锁死为同一物种（如全是兔子） */
export function buildStep1BatchMotifDiversityPreamble(count: number, prompt: string): string {
  if (count <= 1) return "";
  const alts = extractMotifAlternativesFromPrompt(prompt);
  const lines = [
    "【批量生成 — 主体多样性（必须遵守）】",
    `本次一次生成 ${count} 张主图。若提示词中列举多种可接受的主体（如用「/」「、」或括号内多选，或带「等」的列举），整套图必须在「主视线动物/核心造型」上明显区分开，禁止 ${count} 张全部重复同一物种或同一固定构图。`,
    "Each requested image is a SEPARATE output file: every single render must still be ONE photograph only — do NOT merge multiple variants into one grid/collage inside a single image.",
    "Across this batch: maximize diversity of the primary creature/motif when alternatives are implied; do NOT output the same dominant animal on every image.",
  ];
  if (alts.length >= 2) {
    lines.push(
      `User-listed motif pool (rotate across images): ${alts.join(" | ")}. Each image should emphasize a different pool entry when possible.`
    );
  }
  return lines.join("\n");
}

/** 单张图追加的轮换指令（与 buildStep1BatchMotifDiversityPreamble 配合） */
export function buildStep1PerImageMotifVariantLine(
  index: number,
  total: number,
  prompt: string
): string {
  if (total <= 1) return "";
  const alts = extractMotifAlternativesFromPrompt(prompt);
  const lines = [
    `【本张为批量中第 ${index + 1}/${total} 张】`,
    "THIS FRAME (strict): deliver ONE single full-frame product photo — NO in-frame grid, NO collage of multiple rings/panels.",
    "THIS IMAGE VARIANT (strict): Primary focal creature/motif must differ clearly from other images in this same batch — avoid cloning the same species and pose across the set.",
  ];
  if (alts.length >= 2) {
    if (index < alts.length) {
      const pick = alts[index];
      lines.push(
        `ASSIGNED PRIMARY MOTIF FOR THIS RENDER: "${pick}" — make this animal/creature the clear hero of the ring design for this image only; sibling renders use other listed options.`
      );
    } else {
      lines.push(
        `EXTRA SLOT (${index + 1}/${total}): user listed ${alts.length} motif(s) but requested more images — choose a NEW primary cute animal consistent with the brief (not yet used in this batch), distinct from: ${alts.join(
          ", "
        )}.`
      );
    }
  } else {
    lines.push(
      "Interpret the user's cute-animal + floral brief with a fresh primary species or floral emphasis for this slot — vary species, silhouette, and focal layout vs. other batch images."
    );
  }
  return lines.join("\n");
}

export function userRequestedDarkBackground(prompt: string): boolean {
  return /(black background|dark background|黑底|深色背景|深色[^，。\n]{0,24}木|深色老橡|black gold|黑金|onyx|matte black|炭黑|深黑背景)/i.test(
    prompt
  );
}

/** 用户是否在 prompt 里明确写了台面/环境/材质背景（非默认灰白无缝棚拍） */
export function userExplicitEnvironmentOrSurfaceInPrompt(prompt: string): boolean {
  if (userRequestedDarkBackground(prompt)) return true;
  const pl = prompt.toLowerCase();
  if (
    /(橡木|老橡木|胡桃木|实木|原木|木纹|木桌|木台面|木.{0,8}桌面|桌面|台面上|置于.{0,14}(木|桌|台)|木面|年轮|树瘤|桌板|台面)/i.test(
      prompt
    ) ||
    /\b(wood|oak|walnut|teak|mahogany|wooden|woodgrain|wood\s*grain|rustic\s+table|tabletop|driftwood|burl)\b/i.test(
      pl
    )
  ) {
    return true;
  }
  if (
    /(大理石|花岗|石材|天鹅绒|丝绒|绒布|亚麻|竹编|石板|水泥|皮革|velvet|marble|granite|slate|linen|leather)/i.test(
      prompt
    )
  ) {
    return true;
  }
  return false;
}

/** 细戒、女性向、日常通勤等：主题不宜过大夸张，需与戒臂比例协调、自然融入 */
export function userWantsDelicateThinWomensRing(prompt: string): boolean {
  const pl = prompt.toLowerCase();
  if (
    /(细戒|细圈|细款戒|纤细|女戒|女士戒指|女性佩戴|适合女性|适合女士|女性.{0,4}佩戴|秀气|纤巧|轻薄戒|窄戒|细戒臂|戒臂[^，。\n]{0,8}细|小巧戒|精致小戒|日常通勤戒|通勤戒|通勤款|日常戒|日常佩戴|上班佩戴|通勤佩戴|办公佩戴)/i.test(
      prompt
    )
  ) {
    return true;
  }
  if (
    /\b(thin|slim|narrow|delicate|dainty)\s+(ring|band|shank)\b/.test(pl) ||
    /\b(women'?s|womens)\s+ring\b/.test(pl) ||
    /\bring\s+for\s+women\b/.test(pl) ||
    /\bpetite\s+ring\b/.test(pl) ||
    /\b(everyday|daily\s+wear|office\s+wear|commute|commuter)\s+ring\b/.test(pl) ||
    /\bring\s+for\s+(everyday|daily|work|office)\b/.test(pl)
  ) {
    return true;
  }
  return false;
}

/**
 * Step3 佩戴图：用户意图为「适合女性佩戴 / 女戒 / 通勤秀气」等时，加强完整手部与高端棚拍气质。
 * 与 userWantsDelicateThinWomensRing 对齐并略扩同义表达。
 */
export function userWantsWomensRingOnModelPresentation(prompt: string): boolean {
  if (userWantsDelicateThinWomensRing(prompt)) return true;
  const p = prompt.trim();
  const pl = p.toLowerCase();
  if (
    /(女款戒|女式戒|女性戒指|女生戒指|女士款|优雅戒指|气质戒指|送女友|送老婆|送女生)/i.test(p)
  ) {
    return true;
  }
  if (
    /\b(ladies|lady|feminine|elegant)\b.*\bring\b/i.test(pl) ||
    /\bring\b.*\b(ladies|lady|feminine|for\s+her)\b/i.test(pl)
  ) {
    return true;
  }
  return false;
}

/**
 * 戒指 on-model：女性向参考 — 完整手部、欧美手型主参考、优雅大气背景（英文进 img2img）。
 */
export function buildRingWomensOnModelLuxuryPresentationBlock(): string {
  return [
    "WOMEN'S-RING ON-MODEL — LUXURY EDITORIAL REFERENCE (strict): treat the user's brief as a ring suitable for women / elegant wear; match premium e-commerce + high-jewelry campaign quality.",
    "HAND & MODEL READ (strict): show a **natural adult woman's hand** with **European / North American** proportions and skin tone (fair to light-medium) as the **primary default** hand type — believable knuckles, relaxed tendons, realistic skin micro-texture (NOT plastic).",
    "FULL-HAND FRAMING (strict): **most or all fingers visible** plus the back of the hand in a relaxed diagonal or gentle 3/4 pose; the ring finger (or chosen allowed finger) must read clearly but **NOT** as an isolated single-finger macro — preserve **full-hand wearing context** like a luxury catalog on-model shot.",
    "POSE: fingers softly curved, calm elegant gesture; ring centered and readable on the chosen finger.",
    "MANICURE: **medium almond** nails, glossy **neutral nude / beige** polish — sophisticated, not distracting.",
    "BACKGROUND & ATMOSPHERE (strict): **elegant, upscale, quiet-luxury** — soft **shallow bokeh** in warm **beige / tan / champagne** neutrals (suggest fine fabric or refined interior blur), **no clutter**, no busy props, no loud colors.",
    "LIGHTING: **soft diffused studio / editorial** wrap light with gentle speculars on metal and stone; forbid harsh flat flash, cheap snapshot glare, or muddy gray flatness.",
  ].join("\n");
}

/** Step1：细戒/通勤/女性向时约束主题体量与戒臂融合，避免头重脚轻、造型夸张 */
export function buildDelicateRingMotifScaleIntegrationBlock(prompt: string): string {
  if (!userWantsDelicateThinWomensRing(prompt)) return "";
  return [
    "【细戒 / 日常通勤 / 女性佩戴 — 主题比例与融入（必须遵守）】",
    "用户意图包含细戒、日常通勤戒、秀气款或适合女性/日常佩戴：动物/花卉等主题不得过大、过厚、过于夸张；禁止在戒面上做成喧宾夺主的“独立大台座”，避免相对戒臂严重头重脚轻、视觉失衡。",
    "主题体量必须与戒臂宽度、厚度成比例；主题金属应沿戒臂两侧肩线自然延展、顺滑过渡融入（shoulder integration），像从戒圈生长出来，而不是整块摞在戒圈顶上。",
    "DELICATE / EVERYDAY RING MOTIF (strict): centerpiece must be restrained and wearable — NOT theatrical oversized sculpture; compact relative to shank; natural shoulder integration.",
    "NO exaggerated top mass: avoid huge crown, harsh step-off from band, or trophy-like proportions unsuitable for daily commute wear.",
    "Integration: taper motif volume into ring shoulders with smooth, continuous metal flow; balanced, low-drama silhouette.",
  ].join("\n");
}

/**
 * 禁止单张图内出现多件首饰（如多枚戒指并排、多件陈列），Step1 构图 / 全局负面 / Step3 保真共用。
 */
export function buildSingleJewelryPieceOnlyConstraintBlock(): string {
  return [
    "SINGLE JEWELRY SUBJECT ONLY (strict): Exactly ONE physical jewelry piece in the entire frame — one ring OR one pendant body as the only hero product.",
    "FORBID: two or more rings or pendants visible as separate jewelry objects; three-in-a-row / N-in-a-row ring lineup on table, leather, or fabric; multi-piece flat lay; several rings sharing one hero shot.",
    "FORBID: jewelry collection spreads, catalog comparison with multiple SKUs in one photo, left+center+right trio of rings, or duplicate twin rings framing the composition unless the user prompt explicitly requests a pair (default: never).",
    "The only allowed exception for a second metal object is a minimal display stand/holder that is clearly NOT a second ring or pendant; it must not read as another piece of jewelry.",
  ].join("\n");
}

const GLOBAL_NEGATIVE_TAIL_LINES = [
  "No corrosion artifacts: no rust patches, no green oxidation stains, no random tarnish spots, no peeling/plating loss, no uneven faded metal color unless explicitly requested by the user.",
  "For animal motifs: avoid lifeless/stiff expression, avoid statue-like frozen face, avoid dead-eye look, avoid rigid toy-like posture with no organic flow.",
  "For ring inner band: NO extra hole, NO inner-wall cutout, NO perforation slot, NO recessed cavity/pocket, NO inward dent/sink on the finger-contact interior surface.",
  "Ring inner-surface negatives: NO inner dent, NO inner dimple, NO inner groove, NO groove inside shank, NO concave trench on inner shank, NO inner ridge/bump/seam line, NO casting seam on finger-contact interior, NO inner engraving/inner text/inner filigree on the finger-contact inner loop.",
  "Perspective consistency negatives: NO mixed conflicting viewpoints in one product (e.g., face front-on while ring body is side profile), NO twisted impossible ring geometry, NO corkscrew deformation, NO physically contradictory camera projection.",
];

/**
 * 全局负面约束。若用户在 prompt 中明确要求木质台面/木纹/石材等环境，则不得再禁止「木」，
 * 否则会把「深色老橡木桌面」等需求与默认棚拍逻辑一起冲掉。
 */
export function buildGlobalNegativePromptBlock(prompt: string): string {
  const surfaceOk = userExplicitEnvironmentOrSurfaceInPrompt(prompt);
  const propClause = surfaceOk
    ? "unrelated freestanding ceramic figurines or random decorative wood crates as separate props (NOT the user-requested tabletop/surface); if the user described oak/wood grain/marble/fabric table or environment, render that faithfully — do NOT replace with seamless gray/white studio sweep."
    : "wood or ceramic props,";
  const head =
    "NEGATIVE CONSTRAINTS (strictly avoid): multiple unrelated products in one hero shot, multiple salient jewelry pieces in one frame (e.g. three rings side-by-side on leather, row of rings, several pendants in one shot), jewelry collection / multi-SKU lineup, collage layout, photo grid, split screen, multi-panel montage, tiled frames (2x2 / 3x3 / NxN), storyboard layout, contact sheet, diptych/triptych, before-after split, picture-in-picture, any readable text, watermark, signature, logo, human face in frame, deformed or twisted fingers, plastic or resin toy look, " +
    propClause +
    " matte dull flat metal with no highlights, flat lighting with no reflections, blurry output, low resolution, clutter objects, jewelry presentation box as prop, extra earrings or bracelets unless the text prompt explicitly requests a matching set.";
  return [head, ...GLOBAL_NEGATIVE_TAIL_LINES].join("\n");
}

/** 未传用户 prompt 时的最严默认（仍禁止木道具，避免无关木块） */
export const GLOBAL_NEGATIVE_PROMPT_BLOCK = buildGlobalNegativePromptBlock("");

export function buildRingPhysicalBlock(
  context: "main" | "enhance",
  onModel: boolean
): string {
  const lines = [
    "PHYSICAL PRODUCTION (RING) — manufacturability:",
    "- Inner finger opening rule: keep ONLY the central wearable ring hole (the normal finger passage). Do NOT create any additional cutout/perforation/window on the inner wall of the band.",
    "- Inner band integrity (strict): inner band must be a continuous, smooth, complete closed loop surface with even thickness on the finger-contact side; NO extra holes, NO through-slots, NO carved recess pockets, NO dents, NO concave sink areas, NO inward collapsed patches, NO broken inner rim.",
    "- Inner-contact surface finish (strict): the full 360-degree inner loop that touches finger must be smooth, continuous, mirror-polished, and production-finished (finished jewelry grade).",
    "- Forbidden on inner-contact loop: NO inner dent, NO pit/dimple, NO groove/trench, NO raised bump/ridge, NO sharp inner crease/edge line, NO casting seam, NO inner engraving/text/pattern/filigree.",
    "- Decoration placement rule: decorative motifs/engravings/gem settings are allowed only on outer/top surfaces, never on finger-contact inner loop.",
    "- Shank cross-section: solid metal band with believable thickness and volume — NOT hair-thin wire, NOT paper-thin blade edges.",
    "- Under-gallery / underside comfort rule (strict): NO downward protruding claws, spikes, hooks, or dangling ornamental points below the lower finger-contact contour of the band.",
    "- Wearability lock: the ring underside (palm-facing / finger-contact side) must remain smooth, tucked, and snag-free; avoid any protrusion that would poke, scratch, block finger bending, or catch fabric.",
    "- Silhouette boundary (strict): all decorative mass should stay above or flush with shoulder/upper shank flow; do NOT extend decorative elements beneath the ring's bottom contact envelope.",
  ];
  if (context === "enhance" && onModel) {
    lines.push(
      "- On-model: anatomically correct hand — natural finger joints and proportions; do NOT twist, melt, or extra-digit finger geometry."
    );
  }
  return lines.join("\n");
}

/**
 * 吊坠/项链主图与多视角：3D 体积 + 可直立/不可直立两种合法陈列 + 禁止「图2」式反物理摆法。
 * 图1/图2/图3 为内部命名，模型以文字语义执行，不依赖外部图片。
 */
export function buildPendantNecklaceHeroPresentationEnBlock(): string {
  return [
    "PENDANT / NECKLACE — 3D HERO + PRESENTATION (strict): Every pendant/charm must read as a fully sculpted 3D jewelry mass with believable wall thickness, relief depth, and undercuts — NOT a flat stamped coin, NOT a smooth paper-thin silhouette with no depth.",
    "Rear / back views must still communicate solid volumetric form; forbid a pancake-flat back with zero curvature unless the user explicitly requests that rear style.",
    "PHYSICS-FIRST DISPLAY (no necklace chain in frame unless on-model): BEFORE locking composition, infer whether this motif can realistically freestand on the tabletop without tipping (stable base / feet / broad bottom).",
    "IF FREESTAND-PLAUSIBLE — use CENTERED UPRIGHT hero (internal style ref: Fig.3): stable floor contact, pendant centered as hero, bail + jump ring obey gravity (rest on head/motif or natural droop). FORBID rigid vertical bail with air gap as if pulled by an invisible chain.",
    "IF NOT FREESTAND-PLAUSIBLE — use LEAN-AGAINST-SUPPORT hero (internal style ref: Fig.1): lean the pendant body against a clear physical backdrop (display box edge, velvet riser, fabric block, jewelry tray wall). Bail still obeys gravity on metal; weight must read supported.",
    "FORBIDDEN WRONG PATTERN (internal style ref: Fig.2): a non-freestanding pendant balanced on a narrow tip/edge/crown with NO lean-support; bail stiff upward/backward ignoring gravity; one-point contact that would obviously topple in reality.",
  ].join("\n");
}

/** Step1 中文系统提示内：吊坠/项链 3D + 陈列规则（与英文块语义一致） */
export function buildChinesePendantNecklacePresentationBlock(): string {
  return [
    "【吊坠/项链 — 三维结构与陈列方式（系统软限制，必须执行）】",
    "所有吊坠/项链主体必须为完整三维立体结构（可铸造/雕刻的实体厚度与体积），后视图须呈现完整三维形态与可信厚度，禁止整体退化成平面光滑「铁片章」式无体积感造型（用户 prompt 明确要透底/镂空背等时除外）。",
    "生成前须优先判断：该造型在常见展示台面上，若无手扶、能否在重力下自然直立而不倒（重心是否落在可支撑底面/足底/平底等）。",
    "可直立场景：采用「图3」式陈列——主体置于画面中心区域，底部与台面稳定接触，顶置 bail/连接环受重力自然垂落或轻靠头顶/造型金属，符合静力学；禁止 bail 反重力竖直悬空、像被隐形链子拽直。",
    "不可直立场景：采用「图1」式陈列——主体须依靠首饰盒立面、绒布垫/展示块侧壁等**明确可见的支撑物**承托完成平衡，bail 仍须自然下垂或贴靠金属，符合重力。",
    "错误示例「图2」（严禁）：在无法自然直立的前提下，用尖角/窄边/单点支撑「立」在台面上且无任何背景依靠；bail 僵硬上翘或反翘、无视重力；整体呈明显不稳、现实中会倾倒的摆法。",
    "所有合法陈列结果均须保证 bail/活动环在无链入镜时仍呈现自然死重与可信金属接触，禁止「悬浮环」「隐形项链提拉感」。",
  ].join("\n");
}

export function buildPendantPhysicalBlock(onModel: boolean): string {
  const lines = [
    "PHYSICAL PRODUCTION (PENDANT / NECKLACE) — manufacturability:",
    "- Bail / connector: functional bail with a clearly open path for chain (bail hole or slit visibly pass-through); NOT a dead sealed knot, NOT a solid ring with no chain entry.",
    buildPendantNecklaceHeroPresentationEnBlock(),
  ];
  if (!onModel) {
    lines.push(
      "- Bail under gravity — NO CHAIN IN FRAME (strict): hero shots show pendant + bail only (no necklace chain). The bail / teardrop loop / jump ring must **NOT** read as tensioned or pulled straight by an **invisible** chain. Render **natural dead weight**: the bail **tilts and rests** against the top of the head/motif or makes believable metal-on-metal contact (slight backward lean on the figure is good). **FORBID** a stiff vertical bail **floating** in mid-air with a clear air gap, **FORBID** the 'hanging from a necklace' pose when **no chain is visible** — that violates physics."
    );
  }
  if (onModel) {
    lines.push(
      "- Chain (if visible): natural drape under gravity; individual chain links readable — NOT a single blurry rope or smeared tube."
    );
  }
  return lines.join("\n");
}

export function buildMaterialLightingBlock(
  promptLower: string,
  isSterling925: boolean
): string {
  const wantsVintageOxidized = /(oxid|oxidized|patina|vintage|antique|gothic|做旧|复古|暗黑)/i.test(
    promptLower
  );
  const lines = [
    "MATERIAL & LIGHTING (reject plastic / toy look):",
    "macro product photography; sharp focus on fine metal texture;",
    "crisp specular highlights and ray-tracing-like realistic reflections.",
    "Gemstone: use prong setting OR bezel setting where appropriate; stone must appear mechanically seated in metal — NO floating stone detached from metal.",
    "Avoid: plastic sheen, flat ambient-only lighting, dull gray paste metal.",
    wantsVintageOxidized
      ? "If antique/oxidized style is requested: oxidation must be controlled and intentional only in recesses; no dirty rust-like blotches, no peeling, no random discoloration."
      : "Metal finish must be clean and production-grade: no rust, no corrosion, no random oxidation stains, no faded/patchy plating, no dirty discoloration.",
  ];
  const silverish =
    isSterling925 || /silver|sterling|银/.test(promptLower);
  if (silverish) {
    if (wantsVintageOxidized) {
      lines.push(
        "Silver: believable oxidized / antiqued recesses with controlled bright highlights on raised metal (where style fits)."
      );
    } else {
      lines.push(
        "Silver: high-polish sterling with clean specular ribbons and realistic micro-reflections."
      );
    }
  }
  return lines.join("\n");
}

export function buildMainImageCompositionBlock(
  kind: JewelryProductKind,
  prompt: string
): string {
  const hasAnimalMotif =
    /(lion|tiger|wolf|eagle|snake|dragon|cat|dog|owl|phoenix|动物|兽首|狮|虎|狼|鹰|蛇|龙|猫|狗|猫头鹰|凤凰)/i.test(
      prompt
    );
  const customEnv = userExplicitEnvironmentOrSurfaceInPrompt(prompt);
  const dark = userRequestedDarkBackground(prompt);
  const bgLine = customEnv
    ? "Background & environment (strict — honor user text): Implement EXACTLY what the user wrote for surface/table/material (e.g. dark aged oak tabletop, deep readable wood grain), lighting (e.g. soft natural light, macro front close-up), and atmosphere. Do NOT replace with default seamless #F5F5F5 or plain white studio sweep when the user specified wood, stone, fabric, or a real surface. User-requested grain direction / texture must be visible and credible. If the user asks the ring silhouette to echo grain flow, compose so curves and grain feel visually related."
    : dark
      ? "Background: honor user's explicit dark / black / dramatic intent; keep subject edge separation clear."
      : "Background: default seamless studio #F5F5F5 or pure white (#FFFFFF) — do NOT default to near-black gray that collapses metal read; only go dark if the user's prompt clearly asks for black or black-gold mood.";

  const lines = [
    "COMPOSITION (e-commerce hero):",
    "SINGLE FRAME ONLY (strict): output exactly ONE continuous photograph — ONE hero shot per image. NO grid, NO collage, NO split screen, NO multi-panel layout, NO tiled quadrants, NO 2x2 / 3x3 / storyboard, NO contact sheet, NO diptych/triptych, NO white divider lines boxing multiple sub-images; do NOT pack several product variants into one canvas.",
    buildSingleJewelryPieceOnlyConstraintBlock(),
    "Single SKU centered, isolated on backdrop — no jewelry sets, no extra SKU props; if user mentions earrings or other categories but this task is a single ring or single pendant hero, ignore unrelated categories.",
    bgLine,
  ];
  if (kind === "ring") {
    lines.push(
      "STEP1 RING DISPLAY ANGLE (strict — e-commerce hero): mimic premium catalog jewelry: ring STANDS UPRIGHT on the band on the surface, OR a clean flat lay where the TOP decorative plane of the ring faces the camera (face-up). Camera at moderate height (not a low grazing angle along the shank). Soft subtle contact shadow under the ring for grounding."
    );
    lines.push(
      "FORBID side-dominant shots like reference BAD examples: do NOT show the ring lying on its SIDE with only band thickness / shank profile visible; do NOT use a low horizontal grazing angle that emphasizes the ring edge and hides the top motif; do NOT frame the hero as a pure side profile or three-quarter that loses the frontal read of the centerpiece."
    );
    lines.push(
      "REQUIRE: the decorative top face (animal head, stones, filigree) must be the primary visual read — front-facing or slight elevated 3/4 (similar to a standing upright ring product shot), NOT shank-first or band-edge-first."
    );
    lines.push(
      "VIEWPOINT CONSISTENCY LOCK (strict): apply ONE coherent camera perspective to the ENTIRE ring. The hero motif orientation and the band orientation must agree in the same view family. Forbidden: motif near-frontal while the ring body remains side-profile, or any contradictory mixed-angle composite look."
    );
    lines.push(
      "Geometry realism lock (strict): preserve natural ring circular/elliptical continuity and physically plausible mass flow; forbid twisted/warped/shrunk ring body created by forcing a frontal motif onto a side-view ring."
    );
    if (hasAnimalMotif) {
      lines.push(
        "ANIMAL-HEAD RING DISPLAY (strict): hero composition must present the animal head as the primary frontal focal point (similar to a straight hero view), with facial features clearly visible and centered; avoid side-biased angle where only the ring shank dominates."
      );
      lines.push(
        "Animal vitality (strict): expression and sculpting must feel alive and spirited — clear eye focus, subtle facial tension, natural organic rhythm in fur/feather/scale flow; avoid blank, dull, stiff, or emotionless face treatment."
      );
      lines.push(
        "Do NOT crop or hide the animal face; keep eyes/nose/mane (or equivalent key facial structures) readable, symmetric, and visually dominant over decorative side engravings."
      );
      lines.push(
        "Head orientation lock (strict): the animal face must point toward the camera in a near-frontal view (front-facing or slight 10-15 degree turn max). Reject profile/side-face direction where one side of the face is dominant."
      );
      lines.push(
        "Forbidden framing for animal-head ring hero: side profile ring showcase, rotated shank-first angle, or back-of-head emphasis."
      );
      if (userWantsDelicateThinWomensRing(prompt)) {
        lines.push(
          "Delicate / commute / women's band override: keep the animal clearly readable and frontal, but motif relief height and top footprint must stay proportional to the shank — flow into shoulders with smooth taper; NO oversized or exaggerated top platform much wider than the band (avoid severe visual imbalance)."
        );
      }
    }
  } else {
    lines.push(
      customEnv
        ? "Pendant framing (Step1 only): show the pendant body + bail only; NO necklace chain / NO chain segment. Rest the piece on the user-described surface/environment from the prompt (do not ignore wood/stone/fabric)."
        : "Pendant framing (Step1 only): show the pendant body + bail only; NO necklace chain / NO chain segment. OR pristine flat lay on #F5F5F5/white studio."
    );
    lines.push(
      "PENDANT BAIL — GRAVITY (Step1, no chain): the bail must **hang loose under gravity** — resting or leaning against the top/back of the motif/head, believable contact. **FORBID** bail frozen vertical / pulled taut as if by an absent chain (anti-physics 'floating bail')."
    );
    lines.push(
      "STEP1 PENDANT DISPLAY ANGLE (strict): front-facing or slight 3/4 toward camera so motif and stones read clearly; FORBID thin edge-only profile, side-only silhouette, or low grazing angles that hide the main face (same intent as upright ring hero — readable front, not side-only)."
    );
    lines.push(buildPendantNecklaceHeroPresentationEnBlock());
  }
  return lines.join("\n");
}

/** Step1 有参考图时的融合权重与草图/竞品说明 */
export function buildReferenceFusionBlock(refCount: number, prompt: string): string {
  if (refCount <= 0) return "";
  const lines = [
    `【参考图 — ${refCount} 张】`,
    "Structure from reference, look from text: preserve exact geometry, silhouette, and topology from reference image(s); apply material, finish, patina, and lighting from the TEXT prompt.",
    "Multiple references: synthesize into ONE manufacturable piece; never a collage of separate products; text prompt wins conflicts on style.",
    "Theme-first fusion (strict): identify one primary design theme from the user prompt, then integrate reference elements as supporting motifs; do NOT stack all optional elements equally.",
    "Composition hierarchy (strict): establish clear primary/secondary/tertiary visual roles. Keep one dominant focal narrative, and merge other elements only if they reinforce that narrative.",
  ];
  if (/(sketch|hand-?drawn|line art|草图|手绘)/i.test(prompt)) {
    lines.push(
      "Hand-drawn / sketch reference: convert to photoreal 3D product render with jewelry-grade smooth surfaces and clean edges."
    );
  }
  lines.push(
    "If reference looks like third-party catalog shots: strip watermark, logo, and brand text; keep only the jewelry design vocabulary."
  );
  return lines.join("\n");
}

/** Step3 增强：每条视角后统一追加（物理 + 材质 + 负面） */
export function buildEnhanceSoftLimitSuffix(
  prompt: string,
  kind: JewelryProductKind,
  onModel: boolean
): string {
  const pl = prompt.toLowerCase();
  const is925 = /(925|sterling silver|sterling)/.test(pl);
  const physical =
    kind === "ring"
      ? buildRingPhysicalBlock("enhance", onModel)
      : buildPendantPhysicalBlock(onModel);
  return [physical, buildMaterialLightingBlock(pl, is925), buildGlobalNegativePromptBlock(prompt)].join(
    "\n\n"
  );
}

/** Step1（generate-main）："系统提示词"注入（以字符串前置方式模拟 system_prompt）。 */
export function buildNanoBananaProStep1SystemPrompt(prompt: string): string {
  // 注意：图像模型不会把“输出一段提示词”展示出来给用户；
  // 这里是把这套协议当作“内部风格解析与执行指令”来约束图像生成。
  const kind = inferJewelryProductKind(prompt);
  return [
    "SYSTEM PROMPT — 风格解析与执行协议（用于图像生成，不要输出内部思考）",
    "你是一位拥有 20 年经验的资深珠宝设计总监，精通全球艺术史与珠宝工艺。",
    "",
    "你是一位专业珠宝设计师兼 3D 渲染师。在生成珠宝图像时，必须确保所有戒指（ring）和吊坠（pendant）均为完整的三维实体，具备真实物理结构。",
    "正面设计需精美复杂；背面须为可信金属封底与结构补全——可为对称深浮雕、分区肌理、品牌铭牌区或几何背纹，与正面体块重量感一致，避免无信息的大块镜面空背。",
    "吊坠背面应包含挂环与链条连接结构（仅体现连接位置/孔位，不在画面中展示链条本体），并体现焊接或铸造的工艺痕迹。",
    "主图无项链链条时：顶置 bail/挂环须受重力自然垂落或轻靠于头顶/造型顶部，禁止呈「被隐形链子拽直」的悬空竖立环（反物理）。",
    "整体结构需符合佩戴功能与人体工学；与皮肤主接触带可适度平顺，但装饰背面仍可有工业级浮雕起伏，杜绝大面积虚假空心、纸片金属或半成品感。",
    "背面细节应与正面风格协调，共同构成一件完整的高端珠宝作品。",
    "",
    ...(kind === "pendant" ? [buildChinesePendantNecklacePresentationBlock(), ""] : []),
    "【3D结构与工艺硬性约束】",
    "珠宝必须为完整3D实体：严禁空心、凹陷、未完成半成品感；需体现真实厚度、重量感与可佩戴的人体工学。",
    "吊坠后视图（无用户单独描述背面时）默认：按工业珠宝建模做几何补全——想象整块金属经雕刻去料而成；正面凸起在背面须有对应厚度、支撑与对称肌理，深浮雕与细节铺满，禁止退化成无信息的大光滑「铁片背」；实体可手持把玩、360° 不穿帮；不得从背面透视看穿正面图案，不得开放笼状未封闭结构。若用户 prompt 明确透底/镂空背等则服从。",
    "连接处（Bail & Loop）必须牢固且可制造，体现焊接/铸造工艺痕迹；仅体现链条连接孔位，不在主图中展示链条本体。",
    "",
    "无论用户输入何种风格（如新艺术风格、神秘主义艺术风格、赛博朋克、极简主义、工业运动美术风格等多重风格），你必须严格遵循以下“三步设计法”进行创作：",
    "",
    "1. 【风格解构】（内部思考，不输出）：",
    "- 分析用户指定风格的核心视觉语言（是强调曲线还是几何？是复古还是未来？）。",
    "- 提取该风格的典型材质（如：新艺术风格用银和欧泊；装饰艺术风格用铂金和钻石；赛博朋克用钛钢和发光元件）。",
    "- 确定该风格的工艺特征（如：手工锤纹、精密铸造、3D 打印纹理）。",
    "",
    "2. 【逻辑融合】：",
    "- 将用户提供的主题元素（动物/植物）与该风格的视觉语言进行“基因级融合”，而非简单堆砌。",
    "- 例如：如果是“赛博朋克风格的兔子”，不要只画兔子，要画出“机械骨骼、霓虹光路、半透明外壳”的兔子。",
    "- 当用户给出一系列参考元素时，先识别“主设计主题（primary theme）”，再进行层级化融合：主元素服务主题，次元素做辅助点缀；禁止把所有元素等权并列堆叠。",
    "- 任何参考元素若与主主题冲突或会造成视觉噪音，必须弱化或舍弃，保持主题明确、可读性高、可生产。",
    "- 若主题包含动物形象，必须优先保证“生命感表达”：眼神有聚焦、面部神态有张力、动态线条自然连贯。禁止呆滞、僵硬、木讷、标本化的动物造型。",
    "",
    "3. 【工艺落地】：",
    "- 确保设计符合物理逻辑和佩戴需求（结构稳固、戒臂舒适）。",
    "- 必须描述出具体的金属质感、宝石镶嵌方式和光影细节。",
    "- 对于戒指内圈（inner band），必须遵守“内壁完整平滑”硬约束：仅保留正常手指通孔，严禁任何额外孔洞、贯穿槽、口袋状凹陷、内凹坑或塌陷变形。",
    "",
    "执行要求：",
    "- 主图（Step1）必须是单张连续画面，单图单件首饰主体；禁止宫格、拼图、多面板、并列多 SKU。",
    "- 不要输出内部思考；将上述协议直接落实到图像内容与细节中。",
    "- 如需结构化表达（风格特征/材质工艺/主体描述/环境氛围），仅内部使用，不对用户直接输出。",
    "",
    "用户原始提示词（仅供解析使用）：",
    prompt.trim(),
  ].join("\n");
}
