import type { ConfigContext, ExpoConfig } from "expo/config";

const MAPS_FALLBACK_KEY = "CLICK_FOOD_MAPS_KEY_NOT_CONFIGURED";

export default ({ config }: ConfigContext): ExpoConfig => {
  const configuredGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const mapsIsConfigured = Boolean(
    configuredGoogleMapsApiKey && configuredGoogleMapsApiKey !== MAPS_FALLBACK_KEY,
  );

  if (process.env.EAS_BUILD === "true" && !mapsIsConfigured) {
    throw new Error(
      "GOOGLE_MAPS_ANDROID_API_KEY não configurada no ambiente EAS do CLICK-FOOD Entregador.",
    );
  }

  const googleMapsApiKey = mapsIsConfigured
    ? configuredGoogleMapsApiKey!
    : MAPS_FALLBACK_KEY;
  const plugins: NonNullable<ExpoConfig["plugins"]> = [...(config.plugins ?? [])];

  plugins.push([
    "react-native-maps",
    { androidGoogleMapsApiKey: googleMapsApiKey },
  ]);

  return {
    ...config,
    name: config.name ?? "CLICK-FOOD Entregador",
    slug: config.slug ?? "click-food-entregador",
    plugins,
    extra: {
      ...(config.extra ?? {}),
      googleMapsConfigured: mapsIsConfigured,
    },
  };
};
