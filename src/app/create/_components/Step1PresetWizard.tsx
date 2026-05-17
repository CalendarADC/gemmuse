"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import BrandButton from "./BrandButton";
import {
  DICE_STRENGTH_OPTIONS,
  DESIGN_OBJECT_OPTIONS,
  MATERIAL_OPTIONS,
  type Step1DiceStrength,
  type Step1DesignObject,
  type Step1Material,
  type Step1Preset,
  findElementPoolSearchMatches,
  formatElementPool,
  parseElementPoolInput,
} from "@/lib/step1/step1Presets";
import { STEP1_STYLE_OPTIONS } from "@/lib/step1/step1StyleOptions";

export type Step1PresetWizardSavePayload = {
  id?: string;
  name: string;
  elements: string[];
  styleIds: string[];
  designObject: Step1DesignObject;
  materials: Step1Material[];
  diceStrength: Step1DiceStrength;
};

export type Step1PresetWizardProps = {
  open: boolean;
  mode: "create" | "edit";
  initial?: Step1Preset | null;
  onClose: () => void;
  onSave: (payload: Step1PresetWizardSavePayload) => void;
};

const WIZARD_STEPS = ["元素池", "风格", "设计对象", "材质", "骰子强度", "确认"] as const;

export default function Step1PresetWizard({ open, mode, initial, onClose, onSave }: Step1PresetWizardProps) {
  const [step, setStep] = useState(0);
  const [elementRaw, setElementRaw] = useState("");
  const elementTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [styleIds, setStyleIds] = useState<string[]>([]);
  const [designObject, setDesignObject] = useState<Step1DesignObject>("ring");
  const [materials, setMaterials] = useState<Step1Material[]>(["s925"]);
  const [diceStrength, setDiceStrength] = useState<Step1DiceStrength>("single_element_single_style");

  useEffect(() => {
    if (!open) return;
    setStep(0);
    if (initial) {
      setElementRaw(formatElementPool(initial.elements));
      setStyleIds([...initial.styleIds]);
      setDesignObject(initial.designObject);
      setMaterials(initial.materials.length ? [...initial.materials] : ["s925"]);
      setDiceStrength(initial.diceStrength);
    } else {
      setElementRaw("");
      setStyleIds([]);
      setDesignObject("ring");
      setMaterials(["s925"]);
      setDiceStrength("single_element_single_style");
    }
  }, [open, initial]);

  const elements = useMemo(() => parseElementPoolInput(elementRaw), [elementRaw]);

  const summary = useMemo(() => {
    const styleLabels = styleIds
      .map((id) => STEP1_STYLE_OPTIONS.find((s) => s.id === id)?.label)
      .filter(Boolean)
      .join("、");
    return {
      elements: elements.join("、"),
      styles: styleLabels || "—",
      object: DESIGN_OBJECT_OPTIONS.find((o) => o.id === designObject)?.label ?? "—",
      mat:
        materials
          .map((id) => MATERIAL_OPTIONS.find((o) => o.id === id)?.label)
          .filter(Boolean)
          .join("、") || "—",
      dice: DICE_STRENGTH_OPTIONS.find((o) => o.id === diceStrength)?.label ?? "—",
    };
  }, [elements, styleIds, designObject, materials, diceStrength]);

  if (!open) return null;

  const canNext = () => {
    if (step === 0) return elements.length > 0;
    if (step === 1) return styleIds.length > 0;
    if (step === 3) return materials.length > 0;
    return true;
  };

  const handleConfirm = () => {
    if (!elements.length || !styleIds.length) return;
    onSave({
      id: initial?.id,
      name: initial?.name ?? "",
      elements,
      styleIds,
      designObject,
      materials,
      diceStrength,
    });
    onClose();
  };

  const toggleStyle = (id: string) => {
    setStyleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleMaterial = (id: Step1Material) => {
    setMaterials((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <PresetWizardOverlay onClose={onClose}>
      <div
        className="max-h-[min(90vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-wizard-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="preset-wizard-title" className="shrink-0 text-base font-semibold text-gray-900">
            {mode === "edit" ? "修改预设" : "新建预设"}
          </h2>
          {step === 0 ? (
            <ElementPoolSearchBar
              elementRaw={elementRaw}
              elements={elements}
              textareaRef={elementTextareaRef}
            />
          ) : null}
        </div>

        <div className="mb-4 flex flex-wrap gap-1">
          {WIZARD_STEPS.map((label, i) => (
            <span
              key={label}
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                i === step ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-500",
              ].join(" ")}
            >
              {i + 1}.{label}
            </span>
          ))}
        </div>

        {step === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              多个独立元素用逗号分隔；同一组合主题内的子元素用 + 连接（仍算 1 个元素）。
            </p>
            <textarea
              ref={elementTextareaRef}
              className="min-h-[120px] w-full rounded-xl border border-[rgba(94,111,130,0.2)] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              value={elementRaw}
              onChange={(e) => setElementRaw(e.target.value)}
              placeholder="天使翅+天体+卢恩符文,小鸟,小鸡"
            />
            {elements.length > 0 ? (
              <p className="text-xs text-gray-500">已识别 {elements.length} 个元素：{elements.join("、")}</p>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid max-h-[280px] grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-[rgba(94,111,130,0.12)] p-2">
            {STEP1_STYLE_OPTIONS.map((style, index) => (
              <div key={style.id} className="group relative" style={{ zIndex: 50 - index }}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl border px-2 py-2 text-left text-xs transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:scale-[1.02] group-hover:shadow-md ${
                    styleIds.includes(style.id)
                      ? "border-amber-300 bg-amber-50 font-semibold text-amber-900"
                      : "border-transparent bg-white text-[#363028]"
                  }`}
                  onClick={() => toggleStyle(style.id)}
                >
                  <span>{style.label}</span>
                  {styleIds.includes(style.id) ? <span className="text-amber-700">✓</span> : null}
                </button>
                <StyleDescTooltip desc={style.desc} />
              </div>
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <OptionGrid
            options={DESIGN_OBJECT_OPTIONS}
            selected={designObject}
            onSelect={(id) => setDesignObject(id as Step1DesignObject)}
          />
        ) : null}

        {step === 3 ? (
          <div>
            <p className="mb-2 text-sm text-gray-600">可多选；骰子每次从中随机选一种材质。</p>
            <div className="flex flex-col gap-2">
              {MATERIAL_OPTIONS.map((opt, index) => (
                <button
                  key={opt.id}
                  type="button"
                  className={[
                    "rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md",
                    materials.includes(opt.id)
                      ? "border-amber-300 bg-amber-50 font-semibold text-amber-900"
                      : "border-[rgba(94,111,130,0.15)] bg-white text-[#363028]",
                  ].join(" ")}
                  style={{ zIndex: 20 - index }}
                  onClick={() => toggleMaterial(opt.id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    {opt.label}
                    {materials.includes(opt.id) ? <span className="text-amber-700">✓</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <OptionGrid
            options={DICE_STRENGTH_OPTIONS}
            selected={diceStrength}
            onSelect={(id) => setDiceStrength(id as Step1DiceStrength)}
          />
        ) : null}

        {step === 5 ? (
          <div className="space-y-2 rounded-xl bg-[#f8f9fa] p-4 text-sm text-gray-700">
            <p>
              <span className="font-medium">元素池：</span>
              {summary.elements}
            </p>
            <p>
              <span className="font-medium">风格：</span>
              {summary.styles}
            </p>
            <p>
              <span className="font-medium">设计对象：</span>
              {summary.object}
            </p>
            <p>
              <span className="font-medium">材质：</span>
              {summary.mat}
            </p>
            <p>
              <span className="font-medium">骰子强度：</span>
              {summary.dice}
            </p>
            <p className="text-xs text-gray-500">
              {mode === "edit" ? "确认后将更新该预设方案。" : "确认后将保存为新预设方案。"}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex justify-between gap-2">
          <BrandButton type="button" variant="outline" shape="full" onClick={onClose} className="h-[34px] px-4 text-sm">
            取消
          </BrandButton>
          <div className="flex gap-2">
            {step > 0 ? (
              <BrandButton
                type="button"
                variant="outline"
                shape="full"
                onClick={() => setStep((s) => s - 1)}
                className="h-[34px] px-4 text-sm"
              >
                上一步
              </BrandButton>
            ) : null}
            {step < WIZARD_STEPS.length - 1 ? (
              <BrandButton
                type="button"
                variant="outline"
                shape="full"
                disabled={!canNext()}
                onClick={() => setStep((s) => s + 1)}
                className="h-[34px] px-4 text-sm"
              >
                下一步
              </BrandButton>
            ) : (
              <BrandButton
                type="button"
                shape="full"
                onClick={handleConfirm}
                disabled={!canNext()}
                className="h-[34px] px-4 text-sm"
              >
                确认{mode === "edit" ? "修改" : "新建"}
              </BrandButton>
            )}
          </div>
        </div>
      </div>
    </PresetWizardOverlay>
  );
}

function ElementPoolSearchBar({
  elementRaw,
  elements,
  textareaRef,
}: {
  elementRaw: string;
  elements: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);

  const matches = useMemo(
    () => findElementPoolSearchMatches(elementRaw, elements, query),
    [elementRaw, elements, query],
  );

  useEffect(() => {
    setMatchIndex(0);
  }, [query, elementRaw]);

  const focusMatchAt = useCallback(
    (index: number) => {
      const span = matches[index];
      const ta = textareaRef.current;
      if (!span || !ta) return;
      ta.focus();
      ta.setSelectionRange(span.start, span.end);
      const lineHeight = parseInt(getComputedStyle(ta).lineHeight, 10) || 20;
      const before = elementRaw.slice(0, span.start);
      const line = (before.match(/\n/g) ?? []).length;
      ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight / 3);
    },
    [matches, textareaRef, elementRaw],
  );

  const goToMatch = useCallback(
    (index: number) => {
      if (!matches.length) return;
      const next = ((index % matches.length) + matches.length) % matches.length;
      setMatchIndex(next);
      focusMatchAt(next);
    },
    [matches, focusMatchAt],
  );

  const onSearch = () => {
    if (!matches.length) return;
    goToMatch(0);
  };

  const onNext = () => {
    if (!matches.length) return;
    goToMatch(matchIndex + 1);
  };

  const hasQuery = query.trim().length > 0;
  const statusText = !hasQuery
    ? ""
    : matches.length === 0
      ? "无匹配"
      : `${Math.min(matchIndex + 1, matches.length)}/${matches.length}`;

  return (
    <div className="flex min-w-0 max-w-[min(100%,240px)] flex-col items-end gap-1">
      <div className="flex w-full items-center gap-1">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) onNext();
              else onSearch();
            }
          }}
          placeholder="搜索元素"
          aria-label="在元素池中搜索元素"
          className="min-w-0 flex-1 rounded-lg border border-[rgba(94,111,130,0.25)] px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        />
        <button
          type="button"
          onClick={onNext}
          disabled={matches.length === 0}
          title={
            matches.length === 0
              ? "无匹配结果"
              : matches.length === 1
                ? "仅一处匹配"
                : "跳转到下一处（Enter 定位首条，Shift+Enter 下一个）"
          }
          className="shrink-0 rounded-lg border border-[rgba(94,111,130,0.2)] bg-white px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一个
        </button>
      </div>
      {hasQuery ? (
        <span
          className={[
            "text-[10px]",
            matches.length === 0 ? "text-red-600" : "text-gray-500",
          ].join(" ")}
        >
          {statusText}
        </span>
      ) : null}
    </div>
  );
}

function PresetWizardOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {children}
    </div>
  );
}

function StyleDescTooltip({ desc }: { desc: string }) {
  return (
    <div className="pointer-events-none absolute -bottom-2 left-1/2 z-[90] hidden w-[280px] -translate-x-1/2 translate-y-full whitespace-normal rounded-xl bg-white p-2 text-[10px] leading-relaxed text-gray-600 shadow-xl ring-1 ring-gray-200 group-hover:block">
      {desc}
    </div>
  );
}

function OptionGrid<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt, index) => (
        <button
          key={opt.id}
          type="button"
          className={[
            "rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md",
            selected === opt.id
              ? "border-amber-300 bg-amber-50 font-semibold text-amber-900"
              : "border-[rgba(94,111,130,0.15)] bg-white text-[#363028]",
          ].join(" ")}
          style={{ zIndex: 20 - index }}
          onClick={() => onSelect(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
