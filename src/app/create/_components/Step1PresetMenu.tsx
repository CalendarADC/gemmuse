"use client";

import React, { useState } from "react";

import BrandButton from "./BrandButton";
import type { Step1Preset } from "@/lib/step1/step1Presets";
import {
  DICE_STRENGTH_OPTIONS,
  designObjectLabel,
  materialLabel,
} from "@/lib/step1/step1Presets";
import { styleLabelById } from "@/lib/step1/step1StyleOptions";

const PRESET_MENU_PANEL =
  "absolute left-0 top-full z-[35] mt-1.5 min-w-[320px] max-w-[min(100vw-2rem,400px)] overflow-hidden rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] p-2 shadow-lg";

export type Step1PresetMenuProps = {
  presets: Step1Preset[];
  activePresetId: string | null;
  onActivate: (preset: Step1Preset) => void;
  onEdit: (preset: Step1Preset) => void;
  onDeleteRequest: (preset: Step1Preset) => void;
  onCreateNew: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
};

export default function Step1PresetMenu({
  presets,
  activePresetId,
  onActivate,
  onEdit,
  onDeleteRequest,
  onCreateNew,
  onMouseDown,
}: Step1PresetMenuProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div role="listbox" aria-label="预设方案" className={PRESET_MENU_PANEL} onMouseDown={onMouseDown}>
      {presets.length === 0 ? (
        <div className="px-2 py-3 text-center text-sm text-gray-600">
          <p className="mb-3">暂无预设方案</p>
          <BrandButton type="button" shape="full" onClick={onCreateNew} className="h-[34px] w-full px-4 text-sm">
            新建预设
          </BrandButton>
        </div>
      ) : (
        <>
          <PresetList
            presets={presets}
            activePresetId={activePresetId}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            onActivate={onActivate}
            onEdit={onEdit}
            onDeleteRequest={onDeleteRequest}
          />
          <div className="mt-2 border-t border-gray-200 pt-2">
            <BrandButton
              type="button"
              variant="outline"
              shape="full"
              onClick={onCreateNew}
              className="h-[32px] w-full px-3 text-xs"
            >
              + 新建预设
            </BrandButton>
          </div>
        </>
      )}
    </div>
  );
}

function PresetList({
  presets,
  activePresetId,
  expandedId,
  setExpandedId,
  onActivate,
  onEdit,
  onDeleteRequest,
}: {
  presets: Step1Preset[];
  activePresetId: string | null;
  expandedId: string | null;
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
  onActivate: (preset: Step1Preset) => void;
  onEdit: (preset: Step1Preset) => void;
  onDeleteRequest: (preset: Step1Preset) => void;
}) {
  return (
    <div className="max-h-[320px] space-y-1 overflow-y-auto">
      {presets.map((preset, index) => {
        const isActive = activePresetId === preset.id;
        const isExpanded = expandedId === preset.id;
        const diceLabel =
          DICE_STRENGTH_OPTIONS.find((o) => o.id === preset.diceStrength)?.label ?? preset.diceStrength;
        return (
          <div key={preset.id} className="group relative" style={{ zIndex: 40 - index }}>
            <button
              type="button"
              className={[
                "flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2 text-left text-sm shadow-sm transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:scale-[1.01] group-hover:shadow-lg",
                isActive
                  ? "border-amber-400 bg-amber-50 font-semibold text-amber-900"
                  : "border-transparent bg-white text-[#363028]",
              ].join(" ")}
              onClick={() => setExpandedId((id) => (id === preset.id ? null : preset.id))}
            >
              <span className="font-medium">{preset.name}</span>
              <span className="text-[10px] font-normal opacity-65">
                {preset.elements.slice(0, 3).join("、")}
                {preset.elements.length > 3 ? "…" : ""} · {diceLabel}
              </span>
            </button>
            <PresetHoverSummary preset={preset} />
            {isExpanded ? (
              <div className="mt-1 flex gap-1 px-1">
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                  onClick={() => {
                    onActivate(preset);
                    setExpandedId(null);
                  }}
                >
                  激活
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                  onClick={() => {
                    onEdit(preset);
                    setExpandedId(null);
                  }}
                >
                  修改
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                  onClick={() => onDeleteRequest(preset)}
                >
                  删除
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PresetHoverSummary({ preset }: { preset: Step1Preset }) {
  const styles = preset.styleIds.map(styleLabelById).join("、");
  return (
    <div className="pointer-events-none absolute -bottom-2 left-1/2 z-[90] hidden w-[300px] -translate-x-1/2 translate-y-full whitespace-normal rounded-xl bg-white p-3 text-[10px] leading-relaxed text-gray-600 shadow-xl ring-1 ring-gray-200 group-hover:block">
      <div>元素：{preset.elements.join("、")}</div>
      <div className="mt-0.5">风格：{styles}</div>
      <div className="mt-0.5">
        {designObjectLabel(preset.designObject)} · {materialLabel(preset.material)}
      </div>
    </div>
  );
}
