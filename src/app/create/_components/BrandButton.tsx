"use client";

import React from "react";

type BrandButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type BrandButtonShape = "xl" | "full";

export default function BrandButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: BrandButtonVariant;
    shape?: BrandButtonShape;
  }
) {
  const { variant = "primary", shape = "xl", className, ...rest } = props;

  const shapeClass = shape === "full" ? "rounded-full" : "rounded-xl";

  const variantClass =
    variant === "primary"
      ? "brand-btn-primary"
      : variant === "secondary"
        ? "brand-btn-secondary"
        : variant === "outline"
          ? "brand-btn-outline"
          : variant === "ghost"
            ? "brand-btn-ghost"
            : "brand-btn-danger";

  return (
    <button
      {...rest}
      className={["brand-btn", variantClass, shapeClass, className].filter(Boolean).join(" ")}
    />
  );
}

