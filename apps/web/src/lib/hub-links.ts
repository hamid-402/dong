import { RAW_MENU_ITEMS } from "@/lib/app-navigation";
import { routeToHubContentPath } from "@/lib/hub-nav-url";

/** Resolve a classic app path to its mosaic hub URL. */
export function hubPathFor(pathname: string): string {
  return routeToHubContentPath(pathname, RAW_MENU_ITEMS);
}
