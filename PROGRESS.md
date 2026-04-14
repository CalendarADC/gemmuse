# 项目进度备忘（2026-03-29）

> 本机若已安装 Git，可在项目根目录执行：`git init` → `git add -A` → `git commit -m "chore: checkpoint 2026-03-29"`  
> 请勿提交 `.env.local`（已在 `.gitignore` 中）。

## 当前技术栈

- Next.js 16、React 19、TypeScript、Tailwind 4、Zustand、IndexedDB（idb-keyval）、JSZip

## 已实现功能摘要

### Step 1

- 提示词 + 生成主图（老张 `gemini-3-pro-image-preview` / 界面称 nano-banana-pro）
- 参考图最多 **3 张**：本地上传、粘贴、拖拽；可选参考图时走图生图，无参考则文生图
- 关键词补强、参考图融合说明等与 `generate-main` 联动

### Step 2

- 多选主图、历史、刷新主图
- **新增视角**：左侧 / 右侧 / 后视图、**正视图**（原俯视图已改为正视）；已移除单一「侧视图」按钮
- 「生成展示图组合」→ `/api/enhance`

### Step 3 / Step 4

- 展示图网格、下载 ZIP、历史、刷新单张
- Step 4 文案（老张 Chat + Qwen 备选等，见 README）

### 软限制（可生产 / 电商主图）

- 集中模块：`src/lib/ai/jewelrySoftLimits.ts`
- 主图：`generate-main` 拼接物理结构、材质光影、构图背景、负面约束、参考图权重等
- 增强：`enhance` 每条视角追加同一套后缀；佩戴图区分戒指 / 吊坠文案

### 稳定性

- `src/lib/ai/AIService.ts`：老张图像接口对 **429 / 502 / 503** **自动重试**（指数退避，最多 5 次），并解析错误 JSON 为可读中文

## 关键文件路径

| 区域 | 路径 |
|------|------|
| Step1 UI | `src/app/create/_components/Step1Input.tsx` |
| Step2 UI | `src/app/create/_components/Step2Gallery.tsx` |
| Step3 UI | `src/app/create/_components/Step3ImageGallery.tsx` |
| 状态 | `src/store/jewelryGeneratorStore.ts` |
| 主图 API | `src/app/api/generate-main/route.ts` |
| 增强 API | `src/app/api/enhance/route.ts` |
| 图像调用 | `src/lib/ai/AIService.ts` |
| 软限制文案 | `src/lib/ai/jewelrySoftLimits.ts` |

## 环境变量（勿入库）

- `LAOZHANG_API_KEY`（图 + Step4 文案优先等）
- `QWEN_API_KEY` / `DASHSCOPE_API_KEY`（Step4 备选）
- 示例：`.env.local.example`

## 可选下一步

- 安装 Git 后做版本管理；或定期压缩备份项目目录（排除 `node_modules`、`.next`）
- 若 429 仍频繁：错峰、减少单次生成张数、联系老张侧配额/分组
- 如需：合并 `generate-main` 内旧 Etsy 段落与 `jewelrySoftLimits` 去重以缩短 prompt

## 更新（续）

- 已修正 `generate-main` 中 Etsy 约束 **两条「6)」重复**：含 925 条款时光线为 **8)**，否则为 **7)**。

## 更新（2026-04-01）

- Step2 / Step3 增加「我的最爱」入口：历史图可加星收藏，支持单独查看收藏集合。
- 收藏保护已生效：删除历史时会自动跳过加星图片，降低误删风险。
- Step2 / Step3 历史删除新增确认流程（已改为页面内自定义确认弹窗，避免内嵌浏览器吞掉系统 `confirm`）。
- Step3 恢复安全拖拽能力：改为专用 `⤴` 按钮拖到外部软件，避免整卡拖拽导致界面卡住。
- 新增拖拽辅助滚动：在拖图过程中可用滚轮/边缘自动滚动回到 Step1 参考图区域。
- Step1 软限制继续加强：动物主题生命感、细戒/女性/通勤比例融合、批量多样化轮换、内圈（inner band）零缺陷约束。
- 老张接口健壮性增强：兼容多种图片返回字段结构（`inlineData` / `inline_data` / data URL），并对 `finishReason=NO_IMAGE` 增加自动重试。
