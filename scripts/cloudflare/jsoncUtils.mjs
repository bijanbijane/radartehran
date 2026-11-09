/**
 * @file scripts/cloudflare/jsoncUtils.mjs
 * @description Specification-compliant JSONC lexer, parser, and comment-preserving surgical updater
 * for `wrangler.jsonc`. Never corrupts `https://` URLs or string literals containing `//` or `/*`,
 * and preserves comments and top-level formatting when updating `env.staging` bindings.
 */

/**
 * Strips `//` line comments, `/* ... * /` block comments, and trailing commas outside string literals
 * while preserving line breaks and string contents verbatim.
 *
 * @param {string} input
 * @returns {string}
 */
export function stripJsoncCommentsAndTrailingCommas(input) {
  const src = String(input ?? '');
  const len = src.length;
  let out = '';
  let i = 0;
  let inString = false;

  while (i < len) {
    const ch = src[i];
    const next = i + 1 < len ? src[i + 1] : '';

    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    // Single-line comment //
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && src[i] !== '\n' && src[i] !== '\r') {
        i += 1;
      }
      continue;
    }

    // Multi-line block comment /* ... */
    if (ch === '/' && next === '*') {
      const startOffset = i;
      i += 2;
      let closed = false;
      while (i < len) {
        if (src[i] === '*' && src[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        if (src[i] === '\n' || src[i] === '\r') {
          out += src[i];
        }
        i += 1;
      }
      if (!closed) {
        throw new SyntaxError(`Unterminated JSONC block comment starting at offset ${startOffset}`);
      }
      continue;
    }

    out += ch;
    i += 1;
  }

  if (inString) {
    throw new SyntaxError('Unterminated string literal in JSONC input');
  }

  // Second pass: remove trailing commas before `}` or `]` outside strings
  let finalOut = '';
  let inStr2 = false;
  for (let j = 0; j < out.length; j++) {
    const c = out[j];
    if (inStr2) {
      finalOut += c;
      if (c === '\\' && j + 1 < out.length) {
        finalOut += out[j + 1];
        j += 1;
        continue;
      }
      if (c === '"') {
        inStr2 = false;
      }
      continue;
    }
    if (c === '"') {
      inStr2 = true;
      finalOut += c;
      continue;
    }
    if (c === ',') {
      let lookahead = j + 1;
      while (lookahead < out.length && /\s/.test(out[lookahead])) {
        lookahead += 1;
      }
      if (lookahead < out.length && (out[lookahead] === '}' || out[lookahead] === ']')) {
        continue;
      }
    }
    finalOut += c;
  }

  return finalOut;
}

/**
 * Parses a JSONC string into a JavaScript object without corrupting URLs or failing on comments.
 *
 * @param {string} rawJsonc
 * @param {string} [sourceLabel]
 * @returns {any}
 */
export function parseJsonc(rawJsonc, sourceLabel = 'wrangler.jsonc') {
  const sanitized = stripJsoncCommentsAndTrailingCommas(rawJsonc);
  try {
    return JSON.parse(sanitized);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new SyntaxError(`INVALID_JSONC_SYNTAX in ${sourceLabel}: ${detail}`);
  }
}

/**
 * Finds the `{ ... }` character span of a named property value inside an object span,
 * skipping strings and comments accurately.
 *
 * @param {string} src
 * @param {number} searchStart
 * @param {number} searchEnd
 * @param {string} propertyName
 * @param {number} expectedDepth
 * @returns {{ openBraceIdx: number, closeBraceIdx: number } | null}
 */
function findNamedObjectSpanAtDepth(src, searchStart, searchEnd, propertyName, expectedDepth) {
  let i = searchStart;
  let depth = 0;

  while (i < searchEnd) {
    const ch = src[i];
    const next = i + 1 < searchEnd ? src[i + 1] : '';

    if (ch === '"') {
      const strStart = i;
      i += 1;
      let strVal = '';
      while (i < searchEnd) {
        if (src[i] === '\\' && i + 1 < searchEnd) {
          strVal += src[i + 1];
          i += 2;
          continue;
        }
        if (src[i] === '"') {
          i += 1;
          break;
        }
        strVal += src[i];
        i += 1;
      }

      if (depth === expectedDepth && strVal === propertyName) {
        // Look ahead past whitespace/comments for ':'
        let k = i;
        while (k < searchEnd) {
          if (/\s/.test(src[k])) {
            k += 1;
          } else if (src[k] === '/' && src[k + 1] === '/') {
            k += 2;
            while (k < searchEnd && src[k] !== '\n') k += 1;
          } else if (src[k] === '/' && src[k + 1] === '*') {
            k += 2;
            while (k < searchEnd && !(src[k] === '*' && src[k + 1] === '/')) k += 1;
            k += 2;
          } else {
            break;
          }
        }
        if (src[k] === ':') {
          k += 1;
          while (k < searchEnd) {
            if (/\s/.test(src[k])) {
              k += 1;
            } else if (src[k] === '/' && src[k + 1] === '/') {
              k += 2;
              while (k < searchEnd && src[k] !== '\n') k += 1;
            } else if (src[k] === '/' && src[k + 1] === '*') {
              k += 2;
              while (k < searchEnd && !(src[k] === '*' && src[k + 1] === '/')) k += 1;
              k += 2;
            } else {
              break;
            }
          }
          if (src[k] === '{') {
            const openBraceIdx = k;
            let subDepth = 0;
            let m = openBraceIdx;
            while (m < searchEnd) {
              const mc = src[m];
              const mn = m + 1 < searchEnd ? src[m + 1] : '';
              if (mc === '"') {
                m += 1;
                while (m < searchEnd) {
                  if (src[m] === '\\') {
                    m += 2;
                    continue;
                  }
                  if (src[m] === '"') {
                    m += 1;
                    break;
                  }
                  m += 1;
                }
                continue;
              }
              if (mc === '/' && mn === '/') {
                m += 2;
                while (m < searchEnd && src[m] !== '\n') m += 1;
                continue;
              }
              if (mc === '/' && mn === '*') {
                m += 2;
                while (m < searchEnd && !(src[m] === '*' && src[m + 1] === '/')) m += 1;
                m += 2;
                continue;
              }
              if (mc === '{') subDepth += 1;
              else if (mc === '}') {
                subDepth -= 1;
                if (subDepth === 0) {
                  return { openBraceIdx, closeBraceIdx: m };
                }
              }
              m += 1;
            }
          }
        }
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < searchEnd && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < searchEnd && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;

    i += 1;
  }

  return null;
}

/**
 * Extracts all comment lines (`//...` or `/*...* /`) inside a given slice of JSONC text
 * so they can be preserved inside `env.staging` when updating bindings.
 *
 * @param {string} blockText
 * @returns {string[]}
 */
function extractCommentsFromJsoncSlice(blockText) {
  const comments = [];
  const len = blockText.length;
  let i = 0;
  let inString = false;

  while (i < len) {
    const ch = blockText[i];
    const next = i + 1 < len ? blockText[i + 1] : '';

    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      const start = i;
      i += 2;
      while (i < len && blockText[i] !== '\n' && blockText[i] !== '\r') {
        i += 1;
      }
      comments.push(blockText.slice(start, i).trim());
      continue;
    }

    if (ch === '/' && next === '*') {
      const start = i;
      i += 2;
      while (i < len && !(blockText[i] === '*' && blockText[i + 1] === '/')) {
        i += 1;
      }
      if (i < len) i += 2;
      comments.push(blockText.slice(start, i).trim());
      continue;
    }

    i += 1;
  }

  return comments;
}

/**
 * Updates `env.staging` in `wrangler.jsonc` while preserving all comments, URLs, and surrounding
 * top-level and `env.preview` / `env.production` blocks intact.
 *
 * @param {string} rawJsoncText
 * @param {(currentStaging: Record<string, any>) => Record<string, any>} mutatorFn
 * @returns {string}
 */
export function updateEnvStagingInWranglerJsonc(rawJsoncText, mutatorFn) {
  const parsed = parseJsonc(rawJsoncText, 'wrangler.jsonc');
  if (!parsed?.env?.staging || typeof parsed.env.staging !== 'object') {
    throw new Error('INVALID_STAGING_CONFIG: env.staging block not found in wrangler.jsonc');
  }

  const envSpan = findNamedObjectSpanAtDepth(rawJsoncText, 0, rawJsoncText.length, 'env', 1);
  if (!envSpan) {
    throw new Error('INVALID_WRANGLER_JSONC: Unable to locate top-level "env" object span');
  }
  const stagingSpan = findNamedObjectSpanAtDepth(
    rawJsoncText,
    envSpan.openBraceIdx,
    envSpan.closeBraceIdx + 1,
    'staging',
    1,
  );
  if (!stagingSpan) {
    throw new Error('INVALID_WRANGLER_JSONC: Unable to locate "env.staging" object span');
  }

  const originalStagingSlice = rawJsoncText.slice(
    stagingSpan.openBraceIdx,
    stagingSpan.closeBraceIdx + 1,
  );
  const existingComments = extractCommentsFromJsoncSlice(originalStagingSlice);

  const updatedStagingObj = mutatorFn(structuredClone(parsed.env.staging));
  const formattedJson = JSON.stringify(updatedStagingObj, null, 2);
  const indentedLines = formattedJson.split('\n').map((line, idx) => (idx === 0 ? line : `    ${line}`));

  if (existingComments.length > 0) {
    const commentLines = existingComments.map((c) => `      ${c}`);
    indentedLines.splice(indentedLines.length - 1, 0, ...commentLines);
  }

  const replacementBlock = indentedLines.join('\n');
  const updatedJsonc =
    rawJsoncText.slice(0, stagingSpan.openBraceIdx) +
    replacementBlock +
    rawJsoncText.slice(stagingSpan.closeBraceIdx + 1);

  // Verify the updated document still parses cleanly as JSONC
  parseJsonc(updatedJsonc, 'wrangler.jsonc (post-update)');
  return updatedJsonc;
}
