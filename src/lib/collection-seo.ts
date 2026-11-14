import {
  type CollectionAttributes,
  type CollectionKind,
  collections,
  itemSubtitle,
} from '@/lib/collections'
import { imageUrl } from '@/lib/images'
import { absoluteUrl, jsonLd, ogImage, personId, seo } from '@/lib/seo'

type DetailForSeo = {
  slug: string
  title: string
  imageKey: string | null
  attributes: CollectionAttributes
  summary: string
  draft?: boolean
}

/** 種類ごとの構造化データ（検索エンジン・AI が「何のページか」を読み取れるようにする） */
function structuredData(kind: CollectionKind, item: DetailForSeo) {
  const config = collections[kind]
  const url = absoluteUrl(`${config.path}/${item.slug}`)
  const image = imageUrl(item.imageKey)
  const a = item.attributes
  const common = {
    name: item.title,
    url,
    ...(image ? { image: absoluteUrl(image) } : {}),
    ...(item.summary ? { description: item.summary } : {}),
  }

  switch (kind) {
    case 'book':
      return jsonLd({
        '@type': 'Book',
        ...common,
        ...(a.author
          ? {
              author: a.author
                .split('、')
                .map((name) => ({ '@type': 'Person', name })),
            }
          : {}),
        ...(a.isbn ? { isbn: a.isbn } : {}),
        ...(a.publisher
          ? { publisher: { '@type': 'Organization', name: a.publisher } }
          : {}),
        ...(a.publishedDate ? { datePublished: a.publishedDate } : {}),
      })
    case 'certification':
      return jsonLd({
        '@type': 'EducationalOccupationalCredential',
        ...common,
        ...(a.category ? { credentialCategory: a.category } : {}),
        ...(a.issuer
          ? { recognizedBy: { '@type': 'Organization', name: a.issuer } }
          : {}),
      })
    default:
      // 楽器・おもちゃは「持ち主のコレクションの 1 つ」として出す
      return jsonLd({
        '@type': 'CreativeWork',
        ...common,
        about: {
          '@type': 'Thing',
          name: item.title,
          ...(a.category ? { category: a.category } : {}),
        },
        ...(a.maker ? { brand: { '@type': 'Brand', name: a.maker } } : {}),
        author: { '@id': personId },
      })
  }
}

/** コレクションの詳細ページの head（title・description・SNS のカード・構造化データ） */
export function collectionDetailHead(
  kind: CollectionKind,
  item: DetailForSeo | undefined,
) {
  const config = collections[kind]
  if (!item) return { meta: seo({ title: '見つかりません', noindex: true }) }

  const subtitle = itemSubtitle(kind, item.attributes)
  const lead = `${config.label}のコレクション「${item.title}」${subtitle ? `（${subtitle}）` : ''}。`
  const full = `${lead}${item.summary}`
  const description = full.length > 160 ? `${full.slice(0, 159)}…` : full
  const image = imageUrl(item.imageKey)

  return {
    meta: [
      ...seo({
        title: `${item.title}（${config.label}）`,
        description,
        // 非公開（管理者のログイン中だけ見える）は検索に載せない
        noindex: item.draft,
      }),
      ...(image ? ogImage(image, item.title, false) : []),
      structuredData(kind, item),
    ],
  }
}
