import type { EntryWithResolvedLinkedFiles as Entry } from "@keystatic/core/reader";
import ks from "../../keystatic.config";

export type blog = Entry<(typeof ks)["collections"]["blog"]>;
export type books = Entry<(typeof ks)["collections"]["books"]>;
export type instruments = Entry<(typeof ks)["collections"]["instruments"]>;
export type qualifications = Entry<(typeof ks)["collections"]["qualifications"]>;
