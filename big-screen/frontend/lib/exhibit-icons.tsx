import type { ReactNode } from "react";
import type { Scene } from "@/lib/tour-nav";

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

/** 待机/交互：三大主场景 Tab 图标 */
export function SceneTabIcon({ scene, className }: { scene: Scene; className?: string }) {
  if (scene === "welcome") {
    return (
      <Svg className={className}>
        <path
          d="M4 20h16M6.5 20V9.8L12 5.2l5.5 4.6V20"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M10 20v-5.5h4V20" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path
          d="M12 5.2V3.8M9.2 7.2h5.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </Svg>
    );
  }
  if (scene === "corridor") {
    return (
      <Svg className={className}>
        <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="6" y="8" width="4.5" height="5.5" rx="0.8" stroke="currentColor" strokeWidth="1.4" />
        <rect x="12.2" y="8" width="4.5" height="5.5" rx="0.8" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7.2 15.2h2.1M13.4 15.2h2.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="17.8" cy="7.8" r="1" fill="currentColor" />
      </Svg>
    );
  }
  return (
    <Svg className={className}>
      <path
        d="M7 8.2h10l-1.4 11.3H8.4L7 8.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 8.2V6.4A2.8 2.8 0 0 1 12 3.6h0a2.8 2.8 0 0 1 2.8 2.8V8.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="10.8" y="11.5" width="2.4" height="5.2" rx="0.4" fill="currentColor" />
      <rect x="9.2" y="13.1" width="5.6" height="2" rx="0.4" fill="currentColor" />
    </Svg>
  );
}

export function InteractIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="9" y="3.2" width="6" height="10.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 11.2a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 17.2v2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9.5 20h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

export function NavChipIcon({ label, className }: { label: string; className?: string }) {
  const kind = navChipIconKind(label);
  switch (kind) {
    case "back":
      return (
        <Svg className={className}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13.5 8.5L9.5 12l4 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.5 12H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </Svg>
      );
    case "law":
      return (
        <Svg className={className}>
          <path d="M12 3.5v17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M5.5 8h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M7 20.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M8 8l-1.8 12.5M16 8l1.8 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </Svg>
      );
    case "book":
      return (
        <Svg className={className}>
          <path
            d="M5.5 5.5h7.8a2.8 2.8 0 0 1 2.8 2.8V19H8.3a2.8 2.8 0 0 1-2.8-2.8V5.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M8.3 5.5H16a2.8 2.8 0 0 1 2.8 2.8V19" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 9v7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </Svg>
      );
    case "case":
      return (
        <Svg className={className}>
          <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8.5 9h7M8.5 12.5h5.5M8.5 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </Svg>
      );
    case "train":
      return (
        <Svg className={className}>
          <rect x="4" y="6" width="16" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 20h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="9" cy="17.2" r="1.2" fill="currentColor" />
          <circle cx="15" cy="17.2" r="1.2" fill="currentColor" />
          <path d="M8 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </Svg>
      );
    case "cosmetic":
      return (
        <Svg className={className}>
          <path d="M9.5 4.5h5v3.8H9.5V4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10.2 8.3v11M13.8 8.3v11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="12" cy="20.2" rx="3.2" ry="1.2" stroke="currentColor" strokeWidth="1.4" />
        </Svg>
      );
    case "device":
      return (
        <Svg className={className}>
          <path d="M8 6.5h8l2.2 4.2v8.3H5.8V10.7L8 6.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="13.5" r="2.2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.2 13.5h3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </Svg>
      );
    case "mobile":
      return (
        <Svg className={className}>
          <rect x="8" y="3.5" width="8" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
          <path d="M10.5 6.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </Svg>
      );
    case "store":
      return (
        <Svg className={className}>
          <path d="M4.5 10.5h15v8.5H4.5v-8.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M6.5 10.5V7.8L12 4.5l5.5 3.3v2.7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9.5 14h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </Svg>
      );
    case "pharmacy":
      return (
        <Svg className={className}>
          <path d="M7 8.5h10l-1.3 10.5H8.3L7 8.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 11.2v4.8M9.8 13.6h4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </Svg>
      );
    case "corridor":
      return (
        <Svg className={className}>
          <rect x="4" y="5.5" width="16" height="13" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
          <rect x="6.5" y="8" width="4" height="5" rx="0.6" stroke="currentColor" strokeWidth="1.3" />
          <rect x="12.5" y="8" width="4" height="5" rx="0.6" stroke="currentColor" strokeWidth="1.3" />
        </Svg>
      );
    default:
      return (
        <Svg className={className}>
          <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </Svg>
      );
  }
}

function navChipIconKind(label: string) {
  if (/返回/.test(label)) return "back";
  if (/法规/.test(label)) return "law";
  if (/科普/.test(label)) return "book";
  if (/案例/.test(label)) return "case";
  if (/综合培训|培训区/.test(label)) return "train";
  if (/化妆/.test(label)) return "cosmetic";
  if (/器械/.test(label)) return "device";
  if (/新零售|手机/.test(label)) return "mobile";
  if (/传统药房|药房/.test(label)) return "store";
  if (/模拟药店|药店|药品|非药品|处方药/.test(label)) return "pharmacy";
  if (/宣传廊|迎宾/.test(label)) return "corridor";
  return "default";
}
