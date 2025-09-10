import { defineMarkdocConfig, nodes } from "@astrojs/markdoc/config";

export default defineMarkdocConfig({
    nodes: {
        document: {
            ...nodes.document, // 他のオプションにはデフォルトを適用
            render: null, // デフォルトは'article'
        },
    },
});
