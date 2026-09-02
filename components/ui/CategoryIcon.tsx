import {
  Bank,
  Barbell,
  Church,
  ForkKnife,
  GasPump,
  Gift,
  HandHeart,
  HandSoap,
  Lightning,
  PiggyBank,
  PlayCircle,
  Question,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  TShirt,
  WifiHigh,
  Wrench,
} from "@phosphor-icons/react/ssr";
import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";

/* Phosphor is the only icon pack. Categories name their icon as a
   string in data/categories.json, and this is the single place those
   strings resolve, so an unknown name degrades to a question mark
   instead of crashing a page.
   `npm run check` fails if a category names an icon missing here. */

export const ICONS: Record<string, ComponentType<IconProps>> = {
  Bank,
  Barbell,
  Church,
  ForkKnife,
  GasPump,
  Gift,
  HandHeart,
  HandSoap,
  Lightning,
  PiggyBank,
  PlayCircle,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  TShirt,
  WifiHigh,
  Wrench,
};

export function CategoryIcon({
  name,
  size = 20,
  weight = "regular",
  className,
}: {
  name: string;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  className?: string;
}) {
  const Cmp = ICONS[name] ?? Question;
  return <Cmp size={size} weight={weight} className={className} />;
}
