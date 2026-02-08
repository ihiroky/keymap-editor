import { createContext } from "react";

export const DefinitionsContext = createContext({
  keycodes: [],
  behaviours: [],
  behaviourTypes: []
})

export const SearchContext = createContext({
  getSearchTargets: null
})
