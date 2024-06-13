import { createContext } from "solid-js";
import { type Plugin } from "siyuan";
import { type BookmarkDataModel } from "../model";

export const BookmarkContext = createContext<[Plugin, BookmarkDataModel]>();
