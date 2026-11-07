/** URL に使う slug（半角英小文字・数字を 1 つずつのハイフンでつないだもの） */
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** slugPattern と同じで、空文字も通す（空なら自動で作るとき用） */
export const optionalSlugPattern = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/

/** input の pattern 属性に書く形（前後の ^ と $ は不要） */
export const slugInputPattern = slugPattern.source.slice(1, -1)
