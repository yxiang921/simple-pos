"use client";

import { useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import type { FloorObjectData, FloorOrder } from "@/lib/floor";
import { FloorEngine } from "./floor-engine";

export type SceneApi = {
  zoom: (factor: number) => void;
  reset: () => void;
  top: () => void;
  focus: (id: string) => void;
};

type Props = {
  objects: FloorObjectData[];
  floorWidth: number;
  floorDepth: number;
  orders: FloorOrder[];
  alertMinutes: number;
  serverNow: string;
  mode: "view" | "edit";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onError: (message: string) => void;
  tooltipRef: RefObject<HTMLDivElement | null>;
  apiRef: RefObject<SceneApi | null>;
};

/** React wrapper around the imperative three.js engine (loaded client-side only). */
export default function FloorScene(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FloorEngine | null>(null);
  const latest = useRef(props);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let engine: FloorEngine;
    try {
      engine = new FloorEngine(container, {
        onSelect: (id) => latest.current.onSelect(id),
        onMove: (id, x, z) => latest.current.onMove(id, x, z),
        tooltip: () => latest.current.tooltipRef.current,
      });
    } catch (e) {
      latest.current.onError(e instanceof Error ? e.message : "3D view could not start");
      return;
    }
    // The effects below (declared after this one) push the initial props in the same commit.
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const { objects, floorWidth, floorDepth, orders, alertMinutes, serverNow, mode, selectedId } = props;
  useEffect(() => engineRef.current?.setLayout(objects, floorWidth, floorDepth), [objects, floorWidth, floorDepth]);
  useEffect(() => engineRef.current?.setOrders(orders, alertMinutes, serverNow), [orders, alertMinutes, serverNow]);
  useEffect(() => engineRef.current?.setMode(mode), [mode]);
  useEffect(() => engineRef.current?.setSelected(selectedId), [selectedId]);

  useImperativeHandle(
    props.apiRef,
    () => ({
      zoom: (f) => engineRef.current?.zoom(f),
      reset: () => engineRef.current?.resetView(),
      top: () => engineRef.current?.topView(),
      focus: (id) => engineRef.current?.focus(id),
    }),
    [],
  );

  return <div ref={containerRef} className="absolute inset-0" />;
}
