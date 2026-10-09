// Regenerates the fake Steam loc chunks exactly the way Steam's build encodes them:
// JSON.stringify, then escaped into a JS single-quoted literal. Run: node test/fixtures/make-fixtures.mjs
import { writeFileSync } from "node:fs";

const chunk = (obj) =>
  `"use strict";(self.webpackChunksteamui=self.webpackChunksteamui||[]).push([[2664],{36717:e=>{e.exports=JSON.parse('` +
  JSON.stringify(obj).replace(/\\/g, "\\\\").replace(/'/g, "\\'") +
  `')}}]);\n`;

const dir = new URL("./steamui/localization/", import.meta.url);
writeFileSync(new URL("shared_english-json.js", dir), chunk({
  language: "english", Button_Back: "Back", Quote: `Don't "stop"`, Path: "C:\\Steam",
  Multi: "Line1\nLine2", Fmt: "%1$s of %2$s", Tag: "Click <1>here</1>",
  Item: "%1$s item", Item_Plural: "%1$s items",
}));
writeFileSync(new URL("shared_russian-json.js", dir), chunk({
  language: "russian", Button_Back: "Назад", Quote: `Не "стоп"`, Path: "C:\\Steam",
  Multi: "Строка1\nСтрока2", Fmt: "%1$s из %2$s", Tag: "Нажмите <1>сюда</1>",
  Item: "%1$s предмет", Item_Plural: "%1$s предметов", OnlyRu: "x",
}));
// Ukrainian is present but partial; Polish is deliberately absent (optional languages).
writeFileSync(new URL("shared_ukrainian-json.js", dir), chunk({
  language: "ukrainian", Button_Back: "Назад", Item: "%1$s предмет", Item_Plural: "%1$s предметів",
}));
writeFileSync(new URL("shared_german-json.js", dir), chunk({ language: "german", Button_Back: "Zurück" }));
