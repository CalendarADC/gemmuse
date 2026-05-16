export type Step1StyleOption = {
  id: string;
  label: string;
  labelEn: string;
  desc: string;
};

export const STEP1_STYLE_OPTIONS: Step1StyleOption[] = [
  { id: "gothic", label: "哥特风", labelEn: "Gothic", desc: "暗黑、尖拱、神秘、宗教、冷峻、骨感、戏剧张力" },
  { id: "celtic", label: "凯尔特 / 北欧", labelEn: "Celtic & Norse", desc: "结纹、符文、自然、图腾、复古、原始力量、螺旋缠绕" },
  { id: "artsCrafts", label: "工艺美术运动", labelEn: "Arts & Crafts", desc: "手工、自然、质朴、有机线条、反工业、田园诗意" },
  { id: "artNouveau", label: "新艺术", labelEn: "Art Nouveau", desc: "流动曲线、植物藤蔓、柔美、自然主义、浪漫、优雅韵律" },
  { id: "mementoMori", label: "维多利亚哀悼风", labelEn: "Memento Mori", desc: "死亡意象、暗黑浪漫、复古、忧郁、骷髅/棺木符号、黑色与珍珠" },
  { id: "steampunk", label: "蒸汽朋克", labelEn: "Steampunk", desc: "齿轮、黄铜、维多利亚复古、机械、工业革命、奇幻复古未来" },
  { id: "brutalist", label: "粗野主义", labelEn: "Brutalist", desc: "原始、几何、厚重、硬朗、无修饰、工业感、力量感" },
  { id: "baroque", label: "巴洛克", labelEn: "Baroque", desc: "华丽、繁复、动态、戏剧、奢华、光影强烈、夸张张力" },
  { id: "rococo", label: "洛可可", labelEn: "Rococo", desc: "柔美、轻盈、甜腻、曲线、粉彩、装饰性极强、贵族浪漫" },
  { id: "byzantine", label: "拜占庭", labelEn: "Byzantine", desc: "金箔、宗教、对称、华丽镶嵌、神圣庄严" },
];

export function step1StyleLabel(styleId: string): string {
  return STEP1_STYLE_OPTIONS.find((s) => s.id === styleId)?.label ?? styleId;
}
