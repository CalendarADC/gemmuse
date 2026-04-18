import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import type { GalleryImage, GalleryImageType } from "@/store/jewelryGeneratorStore";

import {
  LAOZHANG_IMAGE_MODEL_FLASH,
  LAOZHANG_IMAGE_MODEL_PRO,
  laoZhangImageToImage,
  laoZhangImagesToImage,
  type ImageSize,
  type LaoZhangImageModelId,
} from "@/lib/ai/AIService";
import {
  buildEnhanceSoftLimitSuffix,
  buildPendantRearViewDefaultSolidBackBlock,
  buildRingWomensOnModelLuxuryPresentationBlock,
  buildSingleJewelryPieceOnlyConstraintBlock,
  inferJewelryProductKind,
  userSpecifiedPendantOrNecklaceRearDetail,
  userWantsWomensRingOnModelPresentation,
} from "@/lib/ai/jewelrySoftLimits";
import { requireApiActiveUser } from "@/lib/apiAuth";
import { persistGeneratedImage } from "@/lib/images/persistGeneratedImage";
import { ensureOwnedTaskId } from "@/lib/tasks/resolveTask";

export const runtime = "nodejs";

/** GemMuse 戒指正视/左/右/后官方机位样板（兔子戒指实拍），用于 img2img 第二参考图锁定镜头关系 */
type RingHeroCanonAngle = "front" | "left" | "right" | "rear";

async function loadRingCanonAngleRefDataUrl(which: RingHeroCanonAngle): Promise<string | null> {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "references",
      "ring-rabbit-hero-angles",
      `${which}.png`
    );
    const buf = await readFile(filePath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const RING_DUAL_REF_PREAMBLE = [
  "MULTI-IMAGE INPUT ORDER (strict):",
  "**First** inline image = the user-selected SKU ring (exact motif, stones, metal, engraving lock).",
  "**Second** inline image = GemMuse **canonical camera-angle plate** for this output type (studio rabbit-ring reference pack).",
  "Copy from plate 2 **only** lens grammar: azimuth, elevation (about 30-45 degrees above horizontal, slight high-angle product style), crop tightness, and how much band vs top motif appears in frame.",
  "Do **not** transplant the plate's exact sculpt if it conflicts with image 1; all jewelry identity and topology stay locked to image 1.",
].join("\n");

function withEnhanceSoftLimits(
  prompt: string,
  corePrompt: string,
  /** ?????????????????????????/??????? */
  thisShotOnModel: boolean
): string {
  const kind = inferJewelryProductKind(prompt);
  return `${corePrompt}\n\n${buildEnhanceSoftLimitSuffix(prompt, kind, thisShotOnModel)}`;
}

/** Step3??? Step2 ?????????????????? */
function step3InputImageSovereigntyBlock(): string {
  return [
    "STEP2 INPUT IMAGE ? SOLE AUTHORITY (strict): The attached init image is the exact SKU the user selected. Your task is ONLY re-camera / relight / environment rules as stated ? NOT a new design pass.",
    "LOCK without drift: same primary species or motif (e.g. same animal ? never swap cat for phoenix/rabbit/bird), same figure orientation vocabulary, same gemstone count, cuts, colors, and settings, same metal relief/filigree pattern and oxidation, same band width and topology.",
    "FUNCTIONAL HARDWARE LOCK (strict): Any **bail, hanging loop, jump ring, or obvious chain connector** visible in the init image is part of the SKU. It must **survive every allowed viewpoint** ? show it from the new angle (profile / 3/4 / rear / partial occlusion OK). **Never remove, seal shut, merge into decorative rim, or replace with flat filigree** so the chain path disappears.",
    "FORBID: alternate theme, substitute centerpiece, invented stones, different engraving, style remix, or 'improving' the design. If any USER TEXT conflicts with visible pixels in the init image, IGNORE that text for geometry and OBEY THE IMAGE.",
    "COUNT LOCK (strict): The output must still depict exactly ONE jewelry body ? the same single piece as the input. Never expand into multiple rings side-by-side, a trio lineup, or extra duplicate rings/pendants in frame.",
    buildSingleJewelryPieceOnlyConstraintBlock(),
  ].join("\n\n");
}

/** ???????????????? ????? */
function step3PendantBailTopologyLockBlock(): string {
  return [
    "PENDANT ? BAIL / TOP CONNECTOR (strict, all Step3 product angles):",
    "The init image defines a **bail** (or jump ring / top hanger) attached above the motif. This is **mandatory manufacturing geometry**, not an optional flourish.",
    "Left/right/rear/front table shots: you **must still render that bail as solid metal** ? seen from the side, three-quarter, or back as appropriate. A partially hidden bail behind the head is OK; **a completely missing bail, bail absorbed into the outer filigree halo, or a sealed decorative disk with no through-opening** is NOT OK.",
    "Keep the **same attachment junction and similar loop scale** as the source; do not delete the top loop to simplify a lying-on-side silhouette.",
    "NO VISIBLE CHAIN ? GRAVITY (table / product shots): if the init shows **no necklace chain**, preserve **physically plausible bail pose** ? resting / tilted / leaning on the motif under gravity (like a loose loop on a cushion). **FORBID** converting it into a rigid vertical bail **floating** with an air gap as if pulled by an invisible chain.",
  ].join("\n");
}

/** ????????????????????????? */
function step3UserTextSecondaryBlock(prompt: string): string {
  const t = prompt.trim();
  if (!t) return "";
  return [
    "USER TEXT (lowest priority vs. init image):",
    t,
    "Use only for non-contradictory mood/wording; must not change any visible design fact from the input image.",
  ].join("\n");
}

/** ?/?????????????? ?????? */
function step3LeftRightGemstoneColorLockBlock(): string {
  return [
    "GEMSTONE COLOR / HUE LOCK (strict ? left/right only):",
    "Every visible gem (center stone, eyes, accents) must keep the **same base hue and body color** as the init ? e.g. **blue stays blue**, **green stays green**.",
    "**FORBID** recoloring stones to simulate variety when the camera did not actually move. Gem hue shifts = **incorrect** output for this brief.",
    "Specular highlights may relocate with light; **do not** change underlying stone color, saturation, or apparent species/count.",
  ].join("\n");
}

type Body = {
  taskId?: string;
  provider: string;
  prompt: string;
  selectedMainImageId: string;
  selectedMainImageUrl: string;
  /** true = ???2K??false = ???4K? */
  fastMode?: boolean;
  onModel: boolean;
  left: boolean;
  right: boolean;
  rear: boolean;
  front?: boolean;
  /** @deprecated ???????? front */
  top?: boolean;
  /** Step3??? Banana pro?Pro?? Banana 2?Flash? */
  bananaImageModel?: "banana-pro" | "banana-2";
};

function makeGalleryImage({
  id,
  type,
  url,
  sourceMainImageId,
  debugPromptZh,
}: {
  id: string;
  type: GalleryImageType;
  url: string;
  sourceMainImageId: string;
  debugPromptZh?: string;
}): GalleryImage {
  return {
    id,
    type,
    url,
    sourceMainImageId,
    debugPromptZh,
    createdAt: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;

  try {
  const body = (await req.json().catch(() => ({}))) as Partial<Body>;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const taskIdRaw = typeof body.taskId === "string" ? body.taskId : "";
  const provider = typeof body.provider === "string" ? body.provider : "nano-banana-pro";
  const selectedMainImageId = typeof body.selectedMainImageId === "string" ? body.selectedMainImageId : "";
  const selectedMainImageUrl =
    typeof body.selectedMainImageUrl === "string" ? body.selectedMainImageUrl : "";
  const fastMode = !!body.fastMode;

  const onModel = !!body.onModel;
  const left = !!body.left;
  const right = !!body.right;
  const rear = !!body.rear;
  const front = !!(body.front || body.top);

  const bananaRaw =
    typeof body.bananaImageModel === "string" ? body.bananaImageModel.trim() : "";
  const laoZhangImageModel: LaoZhangImageModelId =
    bananaRaw === "banana-2" ? LAOZHANG_IMAGE_MODEL_FLASH : LAOZHANG_IMAGE_MODEL_PRO;

  // Step3 ?????????????? img2img ???????????????
  const sampling = provider === "nano-banana-pro" ? { temperature: 0.52, topP: 0.8 } : undefined;
  const samplingLeftRight =
    provider === "nano-banana-pro" ? { temperature: 0.4, topP: 0.72 } : undefined;

  if (!selectedMainImageId || !selectedMainImageUrl) {
    return NextResponse.json({ message: "?? selectedMainImage ???" }, { status: 400 });
  }
  /** ??/???? taskId ????????????????????? */
  const taskIdForPersist =
    (await ensureOwnedTaskId(authz.user.id, taskIdRaw)) ?? undefined;

  /** Node ? fetch ???? URL?????????????? */
  const resolvedMainImageUrl =
    selectedMainImageUrl.startsWith("data:") ||
    /^https?:\/\//i.test(selectedMainImageUrl)
      ? selectedMainImageUrl
      : new URL(selectedMainImageUrl, req.url).toString();

    const images: GalleryImage[] = [];
    const runNonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // ?????? gallery?Step 4 ???? galleryImages ??????
    images.push(
      makeGalleryImage({
        id: `gallery_main_${selectedMainImageId}_${runNonce}`,
        type: "main",
        url: resolvedMainImageUrl,
        sourceMainImageId: selectedMainImageId,
      })
    );

    const aspectRatio = "1:1" as const;
    const imageSize: ImageSize = fastMode ? "2K" : "4K";
    const sharedImgArgs = {
      aspectRatio,
      imageSize,
      sampling,
      laoZhangImageModel,
    };
    const sharedImgArgsLeftRight = {
      aspectRatio,
      imageSize,
      sampling: samplingLeftRight ?? sampling,
      laoZhangImageModel,
    };

    const kind = inferJewelryProductKind(prompt);

    const baseKeepInstruction =
      "IMAGE EDIT ONLY: Preserve the init image design bit-for-bit intent ? zero redesign. Same silhouette, same motif, same stones, same metal finish; only apply the requested camera/environment change.";
    // Step3 ???????????????? Step1 ????????????
    const keepMainBackgroundInstruction =
      "BACKGROUND CONSISTENCY (strict): keep the exact same background style/color/lighting setup as the input main image; only change viewing angle. Do NOT replace with a new scene or different backdrop.";
    const strictFrontViewInstruction = [
      "FRONT VIEW HARD CONSTRAINTS (strict):",
      "- Camera angle: lens must be perpendicular to the pendant/ring front plane (true orthographic-like frontal capture). No tilt, no roll, no yaw perspective; NOT 45-degree view, NOT top-down, NOT bottom-up.",
      "- Composition alignment: jewelry must be centered in frame and level; the jewelry vertical center axis must coincide with the frame vertical center axis.",
      "- Perspective control: use macro or eye-level frontal lens language with minimal perspective distortion; keep backdrop planes visually parallel, avoid near-far exaggeration.",
      "- Forbidden outputs: no side view, no oblique view, no partial close-up crop, and no intentional slanting to fake 3D depth.",
    ].join("\n");

    /** ???????????????????????????????????/??????? */
    const ringFrontFiguralFacingLens =
      kind === "ring"
        ? [
            "RING FRONT VIEW ? FIGURE ORIENTATION (strict, standard ???):",
            "Treat this like a classic e-commerce frontal hero: camera at eye level faces the ring's **primary display face** (animal head, relief, or main stone plane). The sculpted figure must face **toward the camera** ? eyes/muzzle toward the viewer in a **vertical** posture (good reference: frontal rabbit head ring).",
            "The shank reads as a **horizontal oval / ellipse** (band roughly edge-on from this angle). This is NOT a plan / overhead shot from above the finger.",
            "FORBID: figure head tipped so the face aims **upward** toward sky/knuckle (zenith-facing) while the camera stays level ? that wrong orientation is NOT acceptable for this frontal view. FORBID mixing this up with top-down.",
          ].join("\n")
        : "";

    const pendantFrontMotifFacingLens =
      kind === "pendant"
        ? [
            "PENDANT FRONT VIEW ? MOTIF ORIENTATION: main motif faces the lens squarely at eye level (face plane toward camera), not tipped to face upward with a horizontal camera.",
          ].join("\n")
        : "";

    /**
     * ???/?????????????????? ? ??/????? + ??????????????????????????????????? bail??
     */
    /** ?/????????????? ?????????? */
    const pendantSideVsRearDisambiguation =
      kind === "pendant"
        ? [
            "SIDE vs REAR ? HARD DISAMBIGUATION (critical):",
            "This output is a **LATERAL left or right product angle**, **NOT** a rear / back / reverse shot.",
            "**FORBID** framing dominated by the **flat plain back plate** (brushed/satin reverse, undecorated oval disk, pin-back, or closure side) with **no main relief motif visible**. That composition belongs to **REAR view only** ? if your image looks like a 'back of pendant' catalog shot, you picked the **wrong 180?*.",
            "**REQUIRE** the **front relief** (lion/animal head, gem eyes, primary filigree face) to stay **in frame** as **profile, three-quarter, or side-on thickness** ? readable muzzle/jaw line, ear edge, or asymmetric mane depth. The viewer must sense **orbiting the piece ~60?110?around a vertical axis**, **not** flipping it face-down.",
          ].join("\n")
        : "";

    /** ??????????????/???? ? ??????????????? */
    const pendantConvexSideNoHollowMoldBlock =
      kind === "pendant"
        ? [
            "CONVEX HERO SURFACE ONLY ? NO HOLLOW / NEGATIVE MOLD (critical for left/right):",
            "The init image is the **outer display face**: **convex** cast relief (lion head, gems, filigree) toward the original camera. Left/right means: move the camera **around the piece** so you still see that **same outward sculpted skin**, in **profile or 3/4**.",
            "**FORBID** the **hollow reverse / negative mold** look: a **concave** dish showing an **impression** of the lion (sunken eyes/snout as cavities), **intaglio back**, die-cast **cavity** facing the lens, or ?looking into the back of the stamping?. If gems read as **dark pits** or the face looks **embossed inward** like a tray, that is **WRONG** ? not a lateral side view.",
            "**REQUIRE convex read**: **nose/snout, brows, mane ridges** project **toward open space** or sideways; gem **tables/crowns** catch light on **outer surfaces**; you see **metal thickness** and **silhouette edge** of the hero relief ? as if a photographer **walked left/right around the storefront mannequin**, **not** turned the medal over.",
            "The lit focal structure must be the **raised metal and stones of the known front**; **NOT** a shallow bowl of **negative relief** facing the camera.",
          ].join("\n")
        : "";

    const pendantLeftRightViewFullBlock =
      kind === "pendant"
        ? [
            "PENDANT ? LEFT/RIGHT CAMERA (critical ? do NOT output another frontal):",
            pendantSideVsRearDisambiguation,
            pendantConvexSideNoHollowMoldBlock,
            "The init image is usually a near-frontal hero. This output must **NOT** be a second straight-on / orthographic front duplicate: the motif plane must **NOT** stay parallel to the camera like the main shot.",
            "Rotate the viewpoint strongly to the requested side into a **three-quarter oblique side shot** (good reference: leopard/lion head pendant on velvet ? seen from above-side so you read snout/jaw **profile**, cheek plane, **metal thickness**, filigree depth, and the **bail loop from an angle** with its opening visible).",
            "REQUIRE obvious **lateral information**: at least two of ? side profile of head/muzzle, flank relief, asymmetric ear/mane read, bail seen from the side, visible back vs front plane separation.",
            "BAIL NON-NEGOTIABLE (side view): the **bail must remain a separate metal loop/volume** attached at the top (or same azimuth as the source), readable in side or 3/4 ? **never cropped off, never merged into the scalloped border, never deleted for a cleaner profile**.",
            "REST ON SURFACE (strict): same display fabric/tray as main image; pendant **lies** on it with weight ? contact shadows, slight cloth compression; FORBID floating, zero contact, or bolt-upright statue pose.",
            "LYING POSE + CAMERA (strict): velvet/table pose is allowed, but the **camera must still sight the same outer convex hero relief** as the init, from a **left/right azimuth** ? **FORBID** arranging the piece so the **hollow molded reverse / concave back impression** faces the lens (that reads as wrong rear, not side).",
            "FORBID: repeating the same frontal framing as the input; symmetric front mascot pose when the brief is left/right view.",
          ].join("\n")
        : "";

    const pendantBailLock = kind === "pendant" ? step3PendantBailTopologyLockBlock() : "";

    const ringLeftRightViewFullBlock =
      kind === "ring"
        ? [
            "RING ? LEFT/RIGHT CAMERA (critical ? NOT a frontal reshoot):",
            "The init is often a **frontal or three-quarter hero** on a surface. You must **orbit the camera ~60?120?* around the jewelry's **vertical axis** (through the finger hole toward the viewer) to the requested **LEFT or RIGHT** side of the set ? **NOT** a zero-degree re-render with only polish/specular/gem tweaks.",
            "RING SIDE ? NOT TOP-DOWN / NOT CLONE FRONT (critical): **FORBID** a bird's-eye / plan / table shot where the band reads as a **perfect symmetric oval or circle identical to the init framing** with only tiny lighting shifts. The shank must read **narrower in one dimension** (band going partially edge-on) OR the head/stones must show **clear 3/4 or profile asymmetry** vs the hero.",
            "**SUCCESS CHECK**: if the ring's **principal viewing bearing** and band ellipse read **the same** as the init (same hero angle with a 'refresh'), you **failed** ? increase lateral orbit until **asymmetric** cues dominate.",
            "**REQUIRE** at least **two** of: (a) **shank/band ellipse skew** ? one side reads clearly narrower, the other wider vs init; (b) **gallery wall or prong row** asymmetrically dominant on the near side; (c) **figural tops**: snout/cheek/jaw **favors one camera side** in clear profile or strong 3/4; (d) **main stone table/crown** seen from a **visibly different tangent** (facet pattern not a copy of the hero).",
            "Stay on the **same convex outer sculpted skin** as the hero ? **FORBID** the face reading as a **concave hollow mold / negative impression** toward the lens (wrong flip, not lateral orbit).",
            "Show **band thickness, stone profile, setting wall** from the requested orbit; **FORBID** another **identical straight-on front** duplicate.",
            "FORBID: a **back-only** shot that hides the primary stone/face (only inner shank/sizing) when the brief is left/right ? lateral orbit, not hiding the top.",
          ].join("\n")
        : "";

    const ringRearViewFullBlock =
      kind === "ring"
        ? [
            "RING ? REAR / BACK VIEW (critical ? NOT another table-top hero):",
            "The init is usually a **table / slightly elevated front or 3/4 hero** showing the top plane of the motif and stones. THIS output must show the **true rear / back of the piece**: back of gallery or bezel, under-gallery struts, closed back plate, inner shank hallmarks, sizing bar, or spring seats as appropriate.",
            "**FORBID** an image that still reads as the **same primary face / stone table toward the camera** as the init (second front hero with only polish or glare changes). If the animal face or crown still **squarely faces the lens** like the main shot, you **failed**.",
            "**REQUIRE** camera to favor **normals pointing away from the original front** (roughly 120?180?from the hero viewing direction): rear metal, backs of prongs, and believable back-of-motif geometry readable; the top motif may be partly occluded or seen from behind.",
            "Keep identical design and stone count; do not invent a new character ? only reveal legitimate rear geometry.",
          ].join("\n")
        : "";

    const ringInnerSurfaceLock =
      kind === "ring"
        ? [
            "RING INNER SURFACE LOCK (strict, all Step3 views):",
            "The finger-contact inner loop must remain a smooth, continuous, mirror-polished 360-degree finished band (finished jewelry quality).",
            "No true dents and no fake dents from lighting/shadow illusion: avoid shading/specular patterns that make the inner loop look concave, sunken, grooved, ridged, or seamed.",
            "FORBID: inner dent, inner pit/dimple, groove inside shank, concave trench, raised inner ridge, seam-like line, casting seam, inner engraving/text/filigree. Decorations stay on outer/top surfaces only.",
          ].join("\n")
        : "";

    const jobs: Array<Promise<GalleryImage>> = [];

    let ringCanonFront: string | null = null;
    let ringCanonLeft: string | null = null;
    let ringCanonRight: string | null = null;
    let ringCanonRear: string | null = null;
    if (kind === "ring" && (left || right || front || rear)) {
      [ringCanonFront, ringCanonLeft, ringCanonRight, ringCanonRear] = await Promise.all([
        loadRingCanonAngleRefDataUrl("front"),
        loadRingCanonAngleRefDataUrl("left"),
        loadRingCanonAngleRefDataUrl("right"),
        loadRingCanonAngleRefDataUrl("rear"),
      ]);
    }

    if (onModel) {
      const onModelLines =
        kind === "ring"
          ? [
              step3InputImageSovereigntyBlock(),
              baseKeepInstruction,
              "Generate an on-model shot where the ring is worn on a human hand in a studio product photography style.",
              ...(userWantsWomensRingOnModelPresentation(prompt)
                ? [buildRingWomensOnModelLuxuryPresentationBlock()]
                : []),
              "FRAMING (strict): do NOT do an extreme close-up of a single finger segment. Show a fuller hand-worn context (at least most of the hand, ideally full hand in frame) so wearing scale looks realistic and natural.",
              "Composition preference: 3/4 hand view or palm-down full-hand showcase with the ring clearly readable; keep natural anatomy and believable perspective.",
              "Use a clean, Etsy-friendly background. Natural lighting, sharp focus, realistic reflections.",
              "FINGER PLACEMENT (strict): wear the ring on **index**, **middle**, or **ring finger** only ? strongly prefer **index or middle** (?? / ??); rotate between index vs middle across generations. **FORBID pinky finger (??)** ? never place the ring on the little finger. Natural knuckle spacing and anatomy.",
              ringInnerSurfaceLock,
              "Avoid adding extra rings, avoid changing the gemstone, keep the ring centered and clearly visible.",
              step3UserTextSecondaryBlock(prompt),
            ]
          : [
              step3InputImageSovereigntyBlock(),
              baseKeepInstruction,
              pendantBailLock,
              "Generate an on-model shot: necklace/pendant worn naturally (cropped framing, no face focus), studio product photography.",
              "FRAMING (strict): avoid over-tight local crop; keep enough upper-torso/neck context so the wearing presentation reads as a complete on-model view.",
              "Chain must drape naturally with gravity; chain links distinct and readable ? not a blurry rope.",
              "Keep bail and pendant design identical to input; clean Etsy-friendly background.",
              step3UserTextSecondaryBlock(prompt),
            ];
      const editPrompt = withEnhanceSoftLimits(
        prompt,
        onModelLines.filter(Boolean).join("\n"),
        true
      );

      const debugPromptZh = `?????????\n??????${prompt}\n\n${editPrompt}`;

      jobs.push(
        laoZhangImageToImage({
          initImageDataUrl: resolvedMainImageUrl,
          prompt: editPrompt,
          ...sharedImgArgs,
        }).then(async (base64) => {
          const persisted = await persistGeneratedImage({
            userId: authz.user.id,
            taskId: taskIdForPersist,
            kind: "on_model",
            base64,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
            keyPrefix: `users/${authz.user.id}/step3/on_model`,
          });
          return makeGalleryImage({
            id: persisted.id,
            type: "on_model",
            url: persisted.url,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
          });
        })
      );
    }

    if (left) {
      const ringChart = kind === "ring" ? ringCanonLeft : null;
      const chartNote = ringChart
        ? `${RING_DUAL_REF_PREAMBLE}\n\nCHART NOTE: image 2 = GemMuse canonical **LEFT** ring product angle (reference pack); replicate its **camera azimuth, elevation (~30-45deg high-angle), crop, and band-vs-motif balance** relative to the subject, applied to the SKU in image 1.`
        : "";
      const editPrompt = withEnhanceSoftLimits(
        prompt,
        [
          ...(chartNote ? [chartNote] : []),
          step3InputImageSovereigntyBlock(),
          baseKeepInstruction,
          step3LeftRightGemstoneColorLockBlock(),
          pendantBailLock,
          pendantLeftRightViewFullBlock,
          ringLeftRightViewFullBlock,
          "LEFT VIEW ? CAMERA ORBIT (strict): From the init **front hero**, orbit the camera **counterclockwise** around a **vertical axis through the jewelry** (top view): move ~**60?110?* toward the piece?s **left flank**. The **main relief / face / stones** must remain **visible in profile or three-quarter** ? this is **NOT** a ~180?rotation to the **flat reverse / back plate**, and **NOT** a **concave hollow-mold / negative impression** of the face (that is invalid).",
          "LEFT JOB ? ASYMMETRY (strict): vs. the init hero, the frame must favor **more visible metal/shank and setting on the camera-left** and **clearer foreshortening toward camera-right** (counterclockwise orbit read ? not a symmetric frontal).",
          "Generate a LEFT-side product view: camera moved to the **LEFT** of the set (around ~60?110?from the old front axis), macro studio shot ? NOT the same straight-on front as the input.",
          "Keep the jewelry design exactly identical to the input; only change camera position and resulting perspective.",
          ringInnerSurfaceLock,
          keepMainBackgroundInstruction,
          "Realistic reflections, no extra jewelry, no model unless it is a ring on a display stand.",
          step3UserTextSecondaryBlock(prompt),
        ]
          .filter(Boolean)
          .join("\n"),
        false
      );

      const debugPromptZh = `左侧视图 / Left view\n用户 prompt：${prompt}\n\n${editPrompt}`;

      const imgPromise = ringChart
        ? laoZhangImagesToImage({
            initImageDataUrls: [resolvedMainImageUrl, ringChart],
            prompt: editPrompt,
            ...sharedImgArgsLeftRight,
          })
        : laoZhangImageToImage({
            initImageDataUrl: resolvedMainImageUrl,
            prompt: editPrompt,
            ...sharedImgArgsLeftRight,
          });

      jobs.push(
        imgPromise.then(async (base64) => {
          const persisted = await persistGeneratedImage({
            userId: authz.user.id,
            taskId: taskIdForPersist,
            kind: "left",
            base64,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
            keyPrefix: `users/${authz.user.id}/step3/left`,
          });
          return makeGalleryImage({
            id: persisted.id,
            type: "left",
            url: persisted.url,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
          });
        })
      );
    }

    if (right) {
      const ringChart = kind === "ring" ? ringCanonRight : null;
      const chartNote = ringChart
        ? `${RING_DUAL_REF_PREAMBLE}\n\nCHART NOTE: image 2 = GemMuse canonical **RIGHT** ring product angle (reference pack); replicate its **camera azimuth, elevation (~30-45deg high-angle), crop, and band-vs-motif balance** relative to the subject, applied to the SKU in image 1.`
        : "";
      const editPrompt = withEnhanceSoftLimits(
        prompt,
        [
          ...(chartNote ? [chartNote] : []),
          step3InputImageSovereigntyBlock(),
          baseKeepInstruction,
          step3LeftRightGemstoneColorLockBlock(),
          pendantBailLock,
          pendantLeftRightViewFullBlock,
          ringLeftRightViewFullBlock,
          "RIGHT VIEW ? CAMERA ORBIT (strict): From the init **front hero**, orbit **clockwise** around the **vertical axis** ~**60?110?* toward the piece?s **right flank**. **Relief / motif must stay visible** in profile or 3/4 ? **NOT** the undecorated back surface facing the lens, and **NOT** a **concave hollow-mold / negative impression** of the face.",
          "RIGHT JOB ? ASYMMETRY (strict): vs. the init hero, the frame must favor **more visible metal/shank and setting on the camera-right** and **clearer foreshortening toward camera-left** (clockwise orbit read ? not a symmetric frontal).",
          "Generate a RIGHT-side product view: camera moved to the **RIGHT** of the set (around ~60?110?from the old front axis), macro studio shot ? NOT the same straight-on front as the input.",
          "Keep the jewelry design exactly identical to the input; only change camera position and resulting perspective.",
          ringInnerSurfaceLock,
          keepMainBackgroundInstruction,
          "Realistic reflections, no extra jewelry, no model unless it is a ring on a display stand.",
          step3UserTextSecondaryBlock(prompt),
        ]
          .filter(Boolean)
          .join("\n"),
        false
      );

      const debugPromptZh = `右侧视图 / Right view\n用户 prompt：${prompt}\n\n${editPrompt}`;

      const imgPromise = ringChart
        ? laoZhangImagesToImage({
            initImageDataUrls: [resolvedMainImageUrl, ringChart],
            prompt: editPrompt,
            ...sharedImgArgsLeftRight,
          })
        : laoZhangImageToImage({
            initImageDataUrl: resolvedMainImageUrl,
            prompt: editPrompt,
            ...sharedImgArgsLeftRight,
          });

      jobs.push(
        imgPromise.then(async (base64) => {
          const persisted = await persistGeneratedImage({
            userId: authz.user.id,
            taskId: taskIdForPersist,
            kind: "right",
            base64,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
            keyPrefix: `users/${authz.user.id}/step3/right`,
          });
          return makeGalleryImage({
            id: persisted.id,
            type: "right",
            url: persisted.url,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
          });
        })
      );
    }

    const pendantRearIndustrialGeometryBlock =
      kind === "pendant" && !userSpecifiedPendantOrNecklaceRearDetail(prompt)
        ? buildPendantRearViewDefaultSolidBackBlock()
        : "";

    if (rear) {
      const ringChart = kind === "ring" ? ringCanonRear : null;
      const chartNote = ringChart
        ? `${RING_DUAL_REF_PREAMBLE}\n\nCHART NOTE: image 2 = GemMuse canonical **REAR / back** ring shot (reference pack); replicate **camera behind the piece, slight high-angle (~40-50deg) toward the back of the motif and shank**, framing and crop relative to the subject in image 1.`
        : "";
      const editPrompt = withEnhanceSoftLimits(
        prompt,
        [
          ...(chartNote ? [chartNote] : []),
          step3InputImageSovereigntyBlock(),
          baseKeepInstruction,
          pendantBailLock,
          ringRearViewFullBlock,
          "Generate a REAR / BACK view of the jewelry: show the back of the setting, rear of bail (for pendants), clasp back, or inner/back surfaces as appropriate?still as a clean studio product shot.",
          kind === "pendant"
            ? "PENDANT REAR PRIORITY: treat this as **industrial geometry completion** — the reverse must read as a **designed CAD back** with depth, not a blank polished slab."
            : "",
          "Keep the jewelry exactly identical to the input image in design; only change the camera angle.",
          pendantRearIndustrialGeometryBlock,
          ringInnerSurfaceLock,
          keepMainBackgroundInstruction,
          "Realistic reflections, no extra jewelry, no hands.",
          step3UserTextSecondaryBlock(prompt),
        ]
          .filter(Boolean)
          .join("\n"),
        false
      );

      const debugPromptZh = `后视图 / Rear view\n用户 prompt：${prompt}\n\n${editPrompt}`;

      const imgPromise = ringChart
        ? laoZhangImagesToImage({
            initImageDataUrls: [resolvedMainImageUrl, ringChart],
            prompt: editPrompt,
            ...sharedImgArgs,
          })
        : laoZhangImageToImage({
            initImageDataUrl: resolvedMainImageUrl,
            prompt: editPrompt,
            ...sharedImgArgs,
          });

      jobs.push(
        imgPromise.then(async (base64) => {
          const persisted = await persistGeneratedImage({
            userId: authz.user.id,
            taskId: taskIdForPersist,
            kind: "rear",
            base64,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
            keyPrefix: `users/${authz.user.id}/step3/rear`,
          });
          return makeGalleryImage({
            id: persisted.id,
            type: "rear",
            url: persisted.url,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
          });
        })
      );
    }

    if (front) {
      const ringChart = kind === "ring" ? ringCanonFront : null;
      const chartNote = ringChart
        ? `${RING_DUAL_REF_PREAMBLE}\n\nCHART NOTE: image 2 = GemMuse canonical **FRONT / near-front** ring hero (slight high-angle 3/4 product style); replicate its **camera-to-subject relationship, elevation, and framing** for the SKU in image 1.`
        : "";
      const editPrompt = withEnhanceSoftLimits(
        prompt,
        [
          ...(chartNote ? [chartNote] : []),
          step3InputImageSovereigntyBlock(),
          baseKeepInstruction,
          pendantBailLock,
          "Generate a straight-on FRONT view of the jewelry: camera facing the primary display face at eye level (like a standard e-commerce hero shot), centered composition in studio product photography.",
          "NOT a top-down / overhead angle. Show the front of the ring shank and stone, or the front face of the pendant, matching the input design.",
          "Keep the jewelry exactly identical to the input image; only adjust camera to a clear frontal angle.",
          strictFrontViewInstruction,
          ringFrontFiguralFacingLens,
          pendantFrontMotifFacingLens,
          ringInnerSurfaceLock,
          keepMainBackgroundInstruction,
          "Realistic reflections, no extra jewelry, no hands unless on-model was requested separately.",
          step3UserTextSecondaryBlock(prompt),
        ]
          .filter(Boolean)
          .join("\n"),
        false
      );

      const debugPromptZh = `正视图 / Front view\n用户 prompt：${prompt}\n\n${editPrompt}`;

      const imgPromise = ringChart
        ? laoZhangImagesToImage({
            initImageDataUrls: [resolvedMainImageUrl, ringChart],
            prompt: editPrompt,
            ...sharedImgArgs,
          })
        : laoZhangImageToImage({
            initImageDataUrl: resolvedMainImageUrl,
            prompt: editPrompt,
            ...sharedImgArgs,
          });

      jobs.push(
        imgPromise.then(async (base64) => {
          const persisted = await persistGeneratedImage({
            userId: authz.user.id,
            taskId: taskIdForPersist,
            kind: "front",
            base64,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
            keyPrefix: `users/${authz.user.id}/step3/front`,
          });
          return makeGalleryImage({
            id: persisted.id,
            type: "front",
            url: persisted.url,
            sourceMainImageId: selectedMainImageId,
            debugPromptZh,
          });
        })
      );
    }

    if (jobs.length) {
      const generated = await Promise.all(jobs);
      images.push(...generated);
    }

    return NextResponse.json({ galleryImages: images });
  } catch (e) {
    console.error("[api/enhance]", e);
    const message =
      e instanceof Error && e.message.trim()
        ? e.message
        : e instanceof Error
          ? "????????????????"
          : typeof e === "string" && e.trim()
            ? e
            : "????";
    return NextResponse.json({ message }, { status: 500 });
  }
}

