/** 视频插槽、缺片占位文案、READY 清单（文案总表 v4 §8） */

export const PLACEHOLDER_MP4 = "/placeholder.mp4";
export const PLACEHOLDER_DURATION_MS = 2500;

export const VIDEOS = {
  welcome: "/welcome.mp4",
  corridorOverview: "/corridor-overview.mp4",
  corridorCosmeticScience: "/corridor-cosmetic-science.mp4",
  corridorCosmeticLaw: "/corridor-cosmetic-law.mp4",
  corridorCosmeticCase1: "/corridor-cosmetic-case1.mp4",
  corridorCosmeticCase2: "/corridor-cosmetic-case2.mp4",
  corridorDrugScience: "/corridor-drug-science.mp4",
  corridorDrugLaw: "/corridor-drug-law.mp4",
  corridorDrugCase1: "/corridor-drug-case1.mp4",
  corridorDrugCase2: "/corridor-drug-case2.mp4",
  corridorDeviceScience: "/corridor-device-science.mp4",
  corridorDeviceLaw: "/corridor-device-law.mp4",
  corridorDeviceCase1: "/corridor-device-case1.mp4",
  corridorDeviceCase2: "/corridor-device-case2.mp4",
  pharmacy: "/pharmacy.mp4",
  pharmacyTraditional: "/pharmacy-traditional.mp4",
  pharmacyNewretail: "/pharmacy-newretail.mp4",
  pharmacyRx: "/pharmacy-rx.mp4",
  pharmacyOtc: "/pharmacy-otc.mp4",
  pharmacyTcm: "/pharmacy-tcm.mp4",
  pharmacyCool: "/pharmacy-cool.mp4",
  pharmacyFood: "/pharmacy-food.mp4",
  pharmacyDevice: "/pharmacy-device.mp4",
  pharmacyCosmetic: "/pharmacy-cosmetic.mp4",
  pharmacyOther: "/pharmacy-other.mp4",
  pharmacyNewdrug: "/pharmacy-newdrug.mp4",
  pharmacyOnline: "/pharmacy-online.mp4",
  pharmacySelf: "/pharmacy-self.mp4",
} as const;

export type VideoKey = keyof typeof VIDEOS;

/** 客户已提供的成片（路径与 VIDEOS 值一致） */
export const READY = new Set<string>([
  "/welcome.mp4",
  "/corridor-overview.mp4",
  "/pharmacy.mp4",
]);

export const VIDEO_LABELS: Record<VideoKey, string> = {
  welcome: "迎宾大厅 · 展厅总体介绍",
  corridorOverview: "宣传廊 · 总览",
  corridorCosmeticScience: "宣传廊 · 化妆区 · 科普篇",
  corridorCosmeticLaw: "宣传廊 · 化妆区 · 法规篇",
  corridorCosmeticCase1: "宣传廊 · 化妆区 · 案例一",
  corridorCosmeticCase2: "宣传廊 · 化妆区 · 案例二",
  corridorDrugScience: "宣传廊 · 药品区 · 科普篇",
  corridorDrugLaw: "宣传廊 · 药品区 · 法规篇",
  corridorDrugCase1: "宣传廊 · 药品区 · 案例一",
  corridorDrugCase2: "宣传廊 · 药品区 · 案例二",
  corridorDeviceScience: "宣传廊 · 医疗器械区 · 科普篇",
  corridorDeviceLaw: "宣传廊 · 医疗器械区 · 法规篇",
  corridorDeviceCase1: "宣传廊 · 医疗器械区 · 案例一",
  corridorDeviceCase2: "宣传廊 · 医疗器械区 · 案例二",
  pharmacy: "模拟药店 · 总览",
  pharmacyTraditional: "模拟药店 · 传统药房",
  pharmacyNewretail: "模拟药店 · 新零售模式区",
  pharmacyRx: "模拟药店 · 处方药区",
  pharmacyOtc: "模拟药店 · 非处方药区",
  pharmacyTcm: "模拟药店 · 中药区",
  pharmacyCool: "模拟药店 · 阴凉库",
  pharmacyFood: "模拟药店 · 食品保健区",
  pharmacyDevice: "模拟药店 · 器械区",
  pharmacyCosmetic: "模拟药店 · 化妆品区",
  pharmacyOther: "模拟药店 · 其他区",
  pharmacyNewdrug: "模拟药店 · 新特药区",
  pharmacyOnline: "模拟药店 · 网络售药区",
  pharmacySelf: "模拟药店 · 自助售药区",
};

export function resolveVideo(key: VideoKey): {
  key: VideoKey;
  src: string;
  ready: boolean;
  label: string;
} {
  const canonical = VIDEOS[key];
  const ready = READY.has(canonical);
  return {
    key,
    src: ready ? canonical : PLACEHOLDER_MP4,
    ready,
    label: VIDEO_LABELS[key],
  };
}
