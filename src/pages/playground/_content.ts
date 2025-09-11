export interface PlaygroundContent {
    slug: string;
    data: {
        draft: boolean;
        visibility: string;
        title: string;
        description: string;
        category: string;
        tags: string[];
        publishedDate: string;
        updatedDate?: string;
        thumbnail: string;
    };
}

export const playgroundContent: PlaygroundContent[] = [
    {
        slug: "3dblock",
        data: {
            draft: false,
            visibility: "public",
            title: "3DBlock",
            description: "3Dブロックをいじる",
            category: "3D",
            tags: ["3D", "Block"],
            publishedDate: "2025-09-09",
            thumbnail: "/src/assets/images/playground/3dblock/thumbnail.png",
        },
    },
    {
        slug: "masonryimage",
        data: {
            draft: false,
            visibility: "public",
            title: "MasonryImage",
            description: "レンガ積み画像を表示する",
            category: "Image",
            tags: ["Image", "Masonry"],
            publishedDate: "2025-09-10",
            thumbnail: "/src/assets/images/playground/masonryimage/thumbnail.png",
        },
    },
    {
        slug: "webyolo",
        data: {
            draft: false,
            visibility: "public",
            title: "WebYOLO",
            description: "クライアントサイドJavaScriptだけで物体認識をする",
            category: "AI",
            tags: ["AI", "Object Recognition", "JavaScript"],
            publishedDate: "2025-09-11",
            thumbnail: "/src/assets/images/playground/webyolo/thumbnail.png",
        },
    },
];
