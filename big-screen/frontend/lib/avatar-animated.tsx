"use client";

import { useEffect, useRef, useState } from "react";
import manifest from "./avatar-states-manifest.json";

export type AvatarAnimState = "idle" | "listening" | "speaking";

type StateMeta = {
  type: "video" | "image";
  src: string;
  poster?: string;
  loop?: boolean;
};

const STATES = manifest as Record<AvatarAnimState, StateMeta>;
const STATE_FADE_MS = 300;

export function resolveAvatarState(
  speaking: boolean,
  listening: boolean,
  thinking = false
): AvatarAnimState {
  if (speaking) return "speaking";
  if (listening || thinking) return "listening";
  return "idle";
}

function StateMedia({
  meta,
  state,
  className = "",
}: {
  meta: StateMeta;
  state: AvatarAnimState;
  className?: string;
}) {
  const cls = `avatar-media avatar-media--${state}${className ? ` ${className}` : ""}`;

  if (meta.type === "video") {
    return (
      <video
        className={cls}
        src={meta.src}
        poster={meta.poster}
        autoPlay
        loop={meta.loop !== false}
        muted
        playsInline
        preload="auto"
        aria-label="普法迎宾数字人"
      />
    );
  }

  return (
    <img
      className={cls}
      src={meta.src}
      alt="普法迎宾数字人"
      draggable={false}
    />
  );
}

export function AvatarAnimated({
  speaking,
  listening,
  thinking = false,
  className = "",
}: {
  speaking: boolean;
  listening: boolean;
  thinking?: boolean;
  className?: string;
}) {
  const state = resolveAvatarState(speaking, listening, thinking);
  const [displayState, setDisplayState] = useState(state);
  const [prevState, setPrevState] = useState<AvatarAnimState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state === displayState) return;
    setPrevState(displayState);
    setDisplayState(state);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPrevState(null), STATE_FADE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, displayState]);

  return (
    <div
      className="avatar-media-stack"
      style={{ ["--avatar-state-fade" as string]: `${STATE_FADE_MS}ms` }}
    >
      <StateMedia
        meta={STATES[displayState]}
        state={displayState}
        className={`avatar-media-cross-in${className ? ` ${className}` : ""}`}
      />
      {prevState ? (
        <StateMedia
          meta={STATES[prevState]}
          state={prevState}
          className="avatar-media-cross-out"
        />
      ) : null}
    </div>
  );
}
