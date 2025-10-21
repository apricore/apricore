import { html } from "/_m/__/lang-html/dist/index.js";
import { css } from "/_m/__/lang-css/dist/index.js";
import { javascript } from "/_m/__/lang-javascript/dist/index.js";
import { json } from "/_m/__/lang-json/dist/index.js";
import { php } from "/_m/__/lang-php/dist/index.js";
import { sql } from "/_m/__/lang-sql/dist/index.js";
import { xml } from "/_m/__/lang-xml/dist/index.js";
import { cpp } from "/_m/__/lang-cpp/dist/index.js";
import { python } from "/_m/__/lang-python/dist/index.js";
import { java } from "/_m/__/lang-java/dist/index.js";
import { markdown } from "/_m/__/lang-markdown/dist/index.js";

import { basicSetup } from "/_m/__/codemirror/dist/index.js";
import { insertNewline, indentWithTab, redo } from "/_m/__/commands/dist/index.js";
import { ChangeSet, Compartment, EditorState, Prec } from "/_m/__/state/dist/index.js";
import { EditorView, ViewPlugin, scrollPastEnd, keymap } from "/_m/__/view/dist/index.js";
import { collab, getSyncedVersion, receiveUpdates, sendableUpdates } from "/_m/__/collab/dist/index.js";

import { HighlightStyle, syntaxHighlighting, StreamLanguage } from "/_m/__/language/dist/index.js";
import { pug } from "/_m/__/legacy-modes/mode/pug.js";
import { tags } from "/_m/__/node_modules/@lezer/highlight/dist/index.js";

const darkTheme = EditorView.theme({
  "&": {
    "color": "white",
    "backgroundColor": "hsl(210, 24%, 12%)",
    "height": "100%",
    "outline": "none"
  },

  "&.cm-focused": {
    "outline": "none"
  },

  ".cm-tooltip > ul[role=listbox]": {
    "font-family": "consolas, jetbrains",
    "font-size": "12px"
  },

  ".cm-scroller": {
    "outline": "none",
    "font-size": "13px",
    "font-family": "consolas, jetbrains",
    "line-height": "20px"
  },
  
  ".cm-scroller::-webkit-scrollbar": {
    "background-color": "hsl(var(--color), 24%, 14%)",
    "width": "13px",
    "height": "13px"
  },
  
  ".cm-scroller::-webkit-scrollbar-track": {
    "border-left": "hsl(var(--color), 38%, 38%) solid 1px",
    "border-top": "hsl(var(--color), 38%, 38%) solid 1px",
  },
  
  ".cm-scroller::-webkit-scrollbar-thumb": {
    "background-color": "hsl(var(--color), 24%, 50%)",
    "background-clip": "content-box",
    "border-left": "transparent solid 1px",
    "border-top": "transparent solid 1px"
  },
  
  ".cm-scroller::-webkit-scrollbar-thumb:hover": {
    "background-color": "hsl(var(--color), 24%, 62%)"
  },
  
  ".cm-scroller::-webkit-scrollbar-corner": {
    "background-color": "hsl(var(--color), 24%, 14%)",
    "border-left": "hsl(var(--color), 38%, 38%) solid 1px",
    "border-top": "hsl(var(--color), 38%, 38%) solid 1px",
  },

  ".cm-gutters": {
    "backgroundColor": "hsl(210, 24%, 14%)",
    "color": "hsl(210, 33.3%, 66.6%)",
    "border-right": "hsl(var(--color), 38%, 38%) solid 1px"
  },
  ".cm-lineNumbers .cm-gutterElement": {
    "min-width": "36px"
  },

  '.cm-gutterElement': {
    "font-size": "13.2px",
    "line-height": "20px"
  },
  '.cm-gutterElement > span[title="Unfold line"],\
  .cm-gutterElement > span[title="Fold line"]': {
    "font-family": "dashicons",
    "font-size": "0",
    "width": "100%",
    "height": "100%",
    "line-height": "20px",
    "vertical-align": "top",
    "display": "inline-block",
  },
  '.cm-gutterElement > span[title="Unfold line"]::before,\
  .cm-gutterElement > span[title="Fold line"]::before': {
    "font-size": "13.2px",
    "line-height": "20px",
    "display": "inline-block"
  },
  '.cm-gutterElement > span[title="Unfold line"]::before': {
    "content": '"\\f345"'
  },
  '.cm-gutterElement > span[title="Fold line"]::before': {
    "content": '"\\f347"'
  },
  
  ".cm-lineNumbers": {
    "text-indent": "12px"
  },
  
  ".cm-content": {
    "caretColor": "#528bff",
    "paddingTop": "0",
  },
  
  ".cm-line": {
    "padding-left": "4px",
    "height": "20px",
  },

  ".cm-cursor, .cm-dropCursor": {
    "borderLeftColor": "hsl(0, 0%, 92%)", 
    "transform": "scale(200%, 130%)",
  },
  ".cm-scroller > .cm-selectionLayer .cm-selectionBackground, \
  .cm-selectionBackground, .cm-content ::selection": {
    "backgroundColor": "hsl(210, 25%, 25%)",
    "outline": "solid 1px hsl(210, 25%, 25%)",
    "border-radius": "1px"
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, \
  .cm-selectionBackground, .cm-content ::selection": {
    "backgroundColor": "hsl(195, 62%, 25%)",
    "outline-color": "hsl(195, 62%, 25%)"
  },

  ".cm-panels": {
    "backgroundColor": "hsl(210, 24%, 16%)", 
    "color": "hsl(210, 0%, 86%)"
  },
  ".cm-panels.cm-panels-top": {
    "borderBottom": "1px solid hsl(var(--color), 38%, 38%)"
  },
  ".cm-panels.cm-panels-bottom": {
    "borderTop": "1px solid hsl(var(--color), 38%, 38%)",
    "z-index": "0"
  },
  ".cm-textfield": {
    "outline": "none"
  },
  ".cm-panel.cm-search [name=close]": {
    "color": "white"
  },

  ".cm-searchMatch": {
    "backgroundColor": "#72a1ff59",
    "outline": "1px solid #457dff"
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    "backgroundColor": "hsl(60, 38%, 62%, 0.5)",
    "outline": "1px solid hsl(60, 38%, 62%)"
  },

  ".cm-activeLine": {
    "backgroundColor": "transparent",
    "outlineOffset": "-2px",
    "outline": "hsla(210, 66.6%, 33.3%, 0.333) solid 2px"
  },
  ".cm-selectionMatch": {
    "backgroundColor": "hsl(30, 50%, 50%, 0.5)"
  },

  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    "backgroundColor": "hsl(210, 66.6%, 66.6%, 0.5)"
  },

  ".cm-activeLineGutter": {
    "backgroundColor": "transparent",
    "color": "white"
  },

  ".cm-foldPlaceholder": {
    "backgroundColor": "transparent",
    "border": "none",
    "color": "hsl(180, 100%, 66.6%)"
  },

  ".cm-tooltip": {
    "border": "none",
    "backgroundColor": "hsl(210, 24%, 20%)",
    "color": "hsl(210, 33.3%, 66.6%)"
  },
  ".cm-tooltip .cm-tooltip-arrow:before": {
    "borderTopColor": "transparent",
    "borderBottomColor": "transparent"
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    "borderTopColor": "#353a42",
    "borderBottomColor": "#353a42"
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      "backgroundColor": "hsl(210, 38%, 24%)",
      "color": "white"
    }
  }
}, {dark: true});
const darkHighlightStyle = HighlightStyle.define([
  {tag: tags.comment, color: "hsl(120, 38%, 66.6%)"},
  {tag: tags.name, color: "hsl(150, 100%, 66.6%)"},
  {tag: tags.variableName, color: "hsl(150, 100%, 66.6%)"},
  {tag: tags.typeName, color: "hsl(120, 100%, 66.6%)"},
  {tag: tags.tagName, color: "hsl(210, 100%, 66.6%)"},
  {tag: tags.propertyName, color: "hsl(180, 100%, 66.6%)"},
  {tag: tags.className, color: "hsl(120, 100%, 80%)"},
  {tag: tags.labelName, color: "hsl(120, 100%, 80%)"},
  {tag: tags.namespace, color: "hsl(210, 100%, 66.6%)"},
  {tag: tags.literal, color: "hsl(30, 100%, 66.6%)"},
  {tag: tags.string, color: "hsl(30, 100%, 66.6%)"},
  {tag: tags.special(tags.string), color: "hsl(15, 100%, 75%)"},
  {tag: tags.character, color: "hsl(45, 100%, 66.6%)"},
  {tag: tags.number, color: "hsl(90, 100%, 80%)"},
  {tag: tags.bool, color: "hsl(90, 100%, 80%)"},
  {tag: tags.regexp, color: "hsl(15, 100%, 75%)"},
  {tag: tags.escape, color: "hsl(45, 100%, 80%)"},
  {tag: tags.keyword, color: "hsl(210, 100%, 66.6%)"},
  {tag: tags.self, color: "hsl(210, 100%, 66.6%)"},
  {tag: tags.null, color: "hsl(90, 100%, 80%)"},
  {tag: tags.atom, color: "hsl(30, 100%, 66.6%)"},
  {tag: tags.unit, color: "hsl(90, 100%, 80%)"},
  {tag: tags.modifier, color: "hsl(210, 100%, 66.6%)"},
  {tag: tags.operatorKeyword, color: "hsl(210, 100%, 66.6%)"},
  {tag: tags.controlKeyword, color: "hsl(300, 100%, 66.6%)"},
  {tag: tags.definitionKeyword, color: "hsl(210, 100%, 66.6%)"},
  {tag: tags.moduleKeyword, color: "hsl(300, 100%, 66.6%)"},
  {tag: tags.angleBracket, color: "hsl(210, 0%, 75%)"},
  {tag: tags.squareBracket, color: "hsl(300, 100%, 80%)"},
  {tag: tags.paren, color: "hsl(60, 100%, 66.6%)"},
  {tag: tags.brace, color: "hsl(210, 100%, 66.6%)"},
  {tag: tags.invalid, color: "hsl(0, 100%, 66.6%)"},
  {tag: tags.meta, color: "hsl(0, 0%, 75%)"},
  {tag: tags.function(tags.variableName), color: "hsl(60, 100%, 80%)"},
  {tag: tags.function(tags.propertyName), color: "hsl(60, 100%, 80%)"},
]);
const lightTheme = EditorView.theme({
  "&": {
    color: "black",
    backgroundColor: "white",
    height: "100%",
    outline: "none"
  },

  "&.cm-focused": {
    "outline": "none"
  },

  ".cm-tooltip > ul[role=listbox]": {
    "font-family": "consolas, jetbrains",
    "font-size": "12px"
  },

  ".cm-scroller": {
      "outline": "none",
      "font-size": "13px",
      "font-family": "consolas, jetbrains",
      "line-height": "20px"
  },
  
  ".cm-scroller::-webkit-scrollbar": {
    "background-color": "hsl(var(--color), 24%, 97%)",
    "width": "13px",
    "height": "13px"
  },
  
  ".cm-scroller::-webkit-scrollbar-track": {
    "border-left": "var(--background-hover) solid 1px",
    "border-top": "var(--background-hover) solid 1px"
  },
  
  ".cm-scroller::-webkit-scrollbar-thumb": {
    "background-color": "hsl(var(--color), 33%, 62%, 0.4)",
    "background-clip": "content-box",
    "border-left": "transparent solid 1px",
    "border-top": "transparent solid 1px"
  },
  
  ".cm-scroller::-webkit-scrollbar-thumb:hover": {
    "background-color": "hsl(var(--color), 25%, 50%, 0.5)"
  },
  
  ".cm-scroller::-webkit-scrollbar-corner": {
    "background-color": "hsl(var(--color), 24%, 97%)",
    "border-left": "var(--background-hover) solid 1px",
    "border-top": "var(--background-hover) solid 1px",
  },
  
  ".cm-gutters": {
    "background-color": "hsl(var(--color), 24%, 97%)",
    "border-right": "var(--background-hover) solid 1px",
    "color": "hsl(210, 16%, 56%)"
  },
  ".cm-lineNumbers .cm-gutterElement": {
    "min-width": "36px"
  },
  
  '.cm-gutterElement': {
    "font-size": "13.2px",
    "line-height": "20px"
  },
  '.cm-gutterElement > span[title="Unfold line"],\
  .cm-gutterElement > span[title="Fold line"]': {
    "font-family": "dashicons",
    "font-size": "0",
    "width": "100%",
    "height": "100%",
    "line-height": "20px",
    "vertical-align": "top",
    "display": "inline-block",
  },                                  
  '.cm-gutterElement > span[title="Unfold line"]::before,\
  .cm-gutterElement > span[title="Fold line"]::before': {
    "font-size": "13.2px",
    "line-height": "20px",
    "display": "inline-block"
  },
  '.cm-gutterElement > span[title="Unfold line"]::before': {
    "content": '"\\f345"'
  },
  '.cm-gutterElement > span[title="Fold line"]::before': {
    "content": '"\\f347"'
  },
  
  ".cm-lineNumbers": {
    "text-indent": "12px"
  },
  
  ".cm-content": {
    "caretColor": "#528bff",
    "paddingTop": "0",
  },
  
  ".cm-line": {
    "padding-left": "4px",
    "height": "20px",
  },

  ".cm-cursor, .cm-dropCursor": {
    "borderLeftColor": "hsl(0, 0%, 33.3%)", 
    "transform": "scale(200%, 130%)",
  },
  ".cm-scroller > .cm-selectionLayer .cm-selectionBackground, \
  .cm-selectionBackground, .cm-content ::selection": {
    "backgroundColor": "hsl(0, 0%, 88%)",
    "outline": "solid 1px hsl(0, 0%, 88%)",
    "border-radius": "1px"
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, \
  .cm-selectionBackground, .cm-content ::selection": {
    "background-color": "hsl(240, 38%, 88%)",
    "outline-color": "hsl(240, 38%, 88%)"
  },

  ".cm-panels": {
    "backgroundColor": "hsl(210, 25%, 95%)"
  },
  ".cm-panels.cm-panels-top": {
    "borderBottom": "1px solid var(--background-hover)"
  },
  ".cm-panels.cm-panels-bottom": {
    "borderTop": "1px solid var(--background-hover)",
    "z-index": "0"
  },
  ".cm-textfield": {
    "outline": "none"
  },

  ".cm-searchMatch": {
    "backgroundColor": "hsl(60, 62%, 62%, 0.5)",
    "outline": "1px solid hsl(60, 62%, 62%)"
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    "backgroundColor": "#72a1ff59",
    "outline": "1px solid #457dff"
  },
    
  ".cm-activeLine": {
    "backgroundColor": "transparent",
    "outlineOffset": "-2px",
    "outline": "hsla(210, 33.3%, 84%, 0.333) solid 2px"
  },

  ".cm-selectionMatch": {
    "backgroundColor": "hsl(0, 0%, 80%, 0.5)"
  },

  ".cm-activeLineGutter": {
    "backgroundColor": "transparent",
    "color": "black"
  },
});
const lightHighlightStyle = HighlightStyle.define([
  {tag: tags.comment, color: "hsl(120, 66.6%, 33.3%)"},
  {tag: tags.name, color: "hsl(270, 100%, 33.3%)"},
  {tag: tags.variableName, color: "hsl(270, 100%, 33.3%)"},
  {tag: tags.typeName, color: "hsl(300, 100%, 33.3%)"},
  {tag: tags.tagName, color: "hsl(30, 100%, 33.3%)"},
  {tag: tags.propertyName, color: "hsl(0, 80%, 50%)"},
  {tag: tags.className, color: "hsl(210, 100%, 33.3%)"},
  {tag: tags.labelName, color: "hsl(210, 100%, 33.3%)"},
  {tag: tags.namespace, color: "hsl(210, 100%, 33.3%)"},
  {tag: tags.literal, color: "hsl(90, 100%, 33.3%)"},
  {tag: tags.string, color: "hsl(90, 100%, 33.3%)"},
  {tag: tags.special(tags.string), color: "hsl(150, 100%, 33.3%)"},
  {tag: tags.character, color: "hsl(75, 100%, 33.3%)"},
  {tag: tags.number, color: "hsl(240, 80%, 33.3%)"},
  {tag: tags.bool, color: "hsl(240, 80%, 33.3%)"},
  {tag: tags.regexp, color: "hsl(150, 100%, 33.3%)"},
  {tag: tags.escape, color: "hsl(75, 100%, 20%)"},
  {tag: tags.keyword, color: "hsl(210, 100%, 50%)"},
  {tag: tags.self, color: "hsl(210, 100%, 50%)"},
  {tag: tags.null, color: "hsl(240, 100%, 50%)"},
  {tag: tags.atom, color: "hsl(180, 100%, 33.3%)"},
  {tag: tags.unit, color: "hsl(240, 100%, 33.3%)"},
  {tag: tags.modifier, color: "hsl(210, 100%, 50%)"},
  {tag: tags.operatorKeyword, color: "hsl(210, 100%, 50%)"},
  {tag: tags.controlKeyword, color: "hsl(240, 80%, 50%)"},
  {tag: tags.definitionKeyword, color: "hsl(210, 100%, 50%)"},
  {tag: tags.moduleKeyword, color: "hsl(240, 80%, 50%)"},
  {tag: tags.angleBracket, color: "hsl(210, 100%, 33.3%)"},
  {tag: tags.squareBracket, color: "hsl(240, 80%, 33.3%)"},
  {tag: tags.paren, color: "hsl(60, 100%, 33.3%)"},
  {tag: tags.brace, color: "hsl(210, 100%, 50%)"},
  {tag: tags.invalid, color: "hsl(180, 100%, 33.3%)"},
  {tag: tags.meta, color: "hsl(0, 0%, 50%)"},
  {tag: tags.function(tags.variableName), color: "hsl(60, 62%, 38%)"},
  {tag: tags.function(tags.propertyName), color: "hsl(60, 62%, 38%)"},
]);
const languages = { html, css, javascript, json, pug: () => StreamLanguage.define(pug), markdown, php, sql, xml, h: cpp, c: cpp, cpp, python, java };
const oneDark = [darkTheme, syntaxHighlighting(darkHighlightStyle)];
const oneLight = [lightTheme, syntaxHighlighting(lightHighlightStyle)];

const scrollPastEndExt = scrollPastEnd();
const keyMap = Prec.highest(
  keymap.of([
    indentWithTab,
    {
      key: "Ctrl-Shift-z",
      run: redo
    },
    {
      key: "Shift-Enter",
      run: insertNewline
    }
  ])
);

function createExtensions() {
  return [ basicSetup, scrollPastEndExt, keyMap, ...arguments ]
}

export {
  createExtensions,
  EditorView, ViewPlugin,
  languages, oneDark, oneLight,
  ChangeSet, Compartment, EditorState,
  collab, getSyncedVersion, receiveUpdates, sendableUpdates
};
