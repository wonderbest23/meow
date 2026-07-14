"use client";

import { Fragment, type ReactNode } from "react";
import { marked, type Token, type Tokens } from "marked";

function inline(tokens: Token[] | undefined, fallback = ""): ReactNode[] {
  if (!tokens?.length) return [fallback];
  return tokens.map((token, index) => {
    const key = `${token.type}-${index}`;
    if (token.type === "strong") return <strong key={key}>{inline(token.tokens, token.text)}</strong>;
    if (token.type === "em") return <em key={key}>{inline(token.tokens, token.text)}</em>;
    if (token.type === "del") return <del key={key}>{inline(token.tokens, token.text)}</del>;
    if (token.type === "codespan") return <code key={key}>{token.text}</code>;
    if (token.type === "link") return <a key={key} href={token.href} target="_blank" rel="noreferrer">{inline(token.tokens, token.text)}</a>;
    if (token.type === "br") return <br key={key} />;
    if (token.type === "image") return <span key={key}>{token.text || "이미지"}</span>;
    if ("tokens" in token && Array.isArray(token.tokens)) return <Fragment key={key}>{inline(token.tokens, "text" in token ? String(token.text) : "")}</Fragment>;
    return <Fragment key={key}>{"text" in token ? String(token.text) : ""}</Fragment>;
  });
}

function listItemContent(tokens: Token[]): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${token.type}-${index}`;
    if (token.type === "text") {
      return <Fragment key={key}>{inline(token.tokens, token.text)}</Fragment>;
    }
    if (token.type === "paragraph") {
      return <p key={key}>{inline(token.tokens, token.text)}</p>;
    }
    return <Fragment key={key}>{blocks([token])}</Fragment>;
  });
}

function blocks(tokens: Token[]): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${token.type}-${index}`;
    if (token.type === "heading") {
      const children = inline(token.tokens, token.text);
      if (token.depth === 1) return <h1 key={key}>{children}</h1>;
      if (token.depth === 2) return <h2 key={key}>{children}</h2>;
      if (token.depth === 3) return <h3 key={key}>{children}</h3>;
      return <h4 key={key}>{children}</h4>;
    }
    if (token.type === "paragraph") return <p key={key}>{inline(token.tokens, token.text)}</p>;
    if (token.type === "blockquote") return <blockquote key={key}>{blocks((token as Tokens.Blockquote).tokens)}</blockquote>;
    if (token.type === "list") {
      const list = token as Tokens.List;
      const List = list.ordered ? "ol" : "ul";
      return <List key={key}>{list.items.map((item, itemIndex) => <li key={itemIndex}>{listItemContent(item.tokens)}</li>)}</List>;
    }
    if (token.type === "table") {
      const table = token as Tokens.Table;
      return <div className="document-table-scroll" key={key}><table><thead><tr>{table.header.map((cell, cellIndex) => <th key={cellIndex}>{inline(cell.tokens, cell.text)}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inline(cell.tokens, cell.text)}</td>)}</tr>)}</tbody></table></div>;
    }
    if (token.type === "hr") return <hr key={key} />;
    if (token.type === "code") return <pre key={key}><code>{token.text}</code></pre>;
    if (token.type === "html") return <p key={key}>{token.text.replace(/<[^>]+>/g, "")}</p>;
    return null;
  });
}

export function DeliveryDocumentPreview({ markdown }: { markdown: string }) {
  return <div className="delivery-document-body">{blocks(marked.lexer(markdown, { gfm: true }))}</div>;
}
