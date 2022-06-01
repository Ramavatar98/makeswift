import { ReactElement, Children, createElement, useMemo, useEffect, useRef, useState } from 'react'
import parse from 'html-react-parser'
import Head from 'next/head'

import { BodySnippet } from './BodySnippet'
import { DocumentReference } from '../../runtimes/react'
import { createDocumentReference } from '../../state/react-page'
import { useQuery, gql } from '../../api/react'
import { useIsInBuilder } from '../../react'
import deepEqual from '../../utils/deepEqual'
import { MakeswiftBadgeSnippet } from './MakeswiftBadge'

enum SnippetLocation {
  Body = 'BODY',
  Head = 'HEAD',
}

export type Snippet = {
  builderEnabled: boolean
  cleanup?: string | null
  code: string
  id: string
  liveEnabled: boolean
  location: SnippetLocation
}

export type PageData = {
  id: string
  meta: {
    title?: string | null | undefined
    description?: string | null | undefined
    keywords?: string | null | undefined
    socialImage?: { id: string; publicUrl: any; mimetype: any } | null | undefined
    favicon?: { id: string; publicUrl: any; mimetype: any } | null | undefined
  }
  snippets: Snippet[]
  fonts: Array<{
    family: string
    variants: string[]
  }>
  seo: {
    canonicalUrl?: string | null | undefined
    isIndexingBlocked?: boolean | null | undefined
  }
  site: {
    id: string
    premium?: boolean
  }
}

const defaultFavicon = {
  mimetype: 'image/png',
  publicUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAAiCAYAAAA6RwvCAAAACXBIWXMAABcRAAAXEQHKJvM/AAABjElEQVRYhc2XzU3EMBCFB8TddAAXn6EE6GCpgNABZ1/IXnymBOgAOmA7YM8+ABVsXEHQQFaKQryeN3Yk3ilKJtEnv/nLUd/3pFG0riGi88yrnQn+UfJ5FUi0riWiB2H4nQn+KRd0DFP8agXEfkqCYJBoHdtxIQxfm+DfFgEhoith3NYE30o/qgGR2BJB+xY7kdYEL8oNFUi0jiFMJuxVWrJqEMFxsyUNCsE6AeNztvBp7aJ143vXksoRnwhYtmNdSoIQa6RlO9YXEWW7KgoCleOgxgTf1QZBT+RZ2lXFING6UxCCq+ceeUE8fYdknY599v9sJvzGBP+yCEgC7GPmETc0OJ+0awAlkhe2pAbIXAeFZ8xe2g2Nk3c3ub0xwWt6zY9qbmiqGVMbZK21ZC/YmhlbeBMTzZNDQqcvDb1kM1x32iqZSt1HaqukfKvq34BAOTLsrH+ETNmUkKHHA+428RgeclPVWozeSyAI2EdWB34jtqXNTAySOY3i/KgFIlqOa4GkFmBegorzg4joG07he/M7zl6jAAAAAElFTkSuQmCC',
}

// Taken from https://github.com/facebook/react/blob/14bac6193a334eda42e727336e8967419f08f5df/packages/react-dom/src/server/ReactPartialRenderer.js#L208
const VALID_TAG_REGEX = /^[a-zA-Z][a-zA-Z:_.\-\d]*$/

const VALID_HEAD_ELEMENT_TYPES = [
  'title',
  'base',
  'link',
  'style',
  'meta',
  'script',
  'noscript',
  'template',
]

function snippetToElement(snippet: Pick<Snippet, 'id' | 'code'>): (string | ReactElement)[] {
  return Children.map(parse(snippet.code), element => {
    if (typeof element === 'string') return element

    if (!VALID_TAG_REGEX.test(element.type)) return null

    const key = element.key ? `${snippet.id}:${element.key}` : snippet.id

    return createElement(element.type, { ...element.props, key })
  })
}

const filterUsedSnippetProperties = ({
  code,
  builderEnabled,
  liveEnabled,
  location,
  cleanup,
}: Snippet) => ({
  code,
  builderEnabled,
  liveEnabled,
  location,
  cleanup,
})

type Props = {
  page: PageData
  preview?: boolean
}

export const PAGE_SNIPPETS_QUERY = gql`
  query PageById($id: ID!) {
    page(id: $id) {
      __typename
      id
      snippets {
        __typename
        id
        name
        code
        cleanup
        location
        shouldAddToNewPages
        liveEnabled
        builderEnabled
      }
    }
  }
`

export type SiteFontsSiteQuery = {
  site?: {
    id: string
    googleFonts: {
      edges: Array<{
        activeVariants: Array<{ specifier: string }>
        node: {
          family: string
          variants: Array<{ specifier: string }>
        }
      } | null>
    }
  } | null
}

export const SITE_FONTS_QUERY = gql`
  query SiteById($id: ID!) {
    site(id: $id) {
      id
      googleFonts {
        edges {
          activeVariants {
            specifier
          }
          node {
            family
            variants {
              specifier
            }
          }
        }
      }
    }
  }
`

export function Page({ page, preview = false }: Props): JSX.Element {
  const isInBuilder = useIsInBuilder()
  const [snippets, setSnippets] = useState(page.snippets)
  // We're using useQuery here for page snippets and site fonts so that anytime the user change
  // the snippets or fonts on the builder, the change would be reflected here.
  // See this PR for discussions and things we can do to improve it in the future:
  // https://github.com/makeswift/makeswift/pull/77
  useQuery<{ page: { snippets: Snippet[] } }>(PAGE_SNIPPETS_QUERY, {
    variables: { id: page.id },
    skip: isInBuilder === false,
    fetchPolicy: 'cache-only',
    onCompleted(data) {
      if (data == null) return

      const oldSnippets = snippets.map(filterUsedSnippetProperties)
      const newSnippets = data.page.snippets.map(filterUsedSnippetProperties)

      if (deepEqual(newSnippets, oldSnippets)) return

      setSnippets(data.page.snippets)
    },
  })
  const { data: siteData } = useQuery<SiteFontsSiteQuery>(SITE_FONTS_QUERY, {
    variables: { id: page.site.id },
    skip: isInBuilder === false,
    fetchPolicy: 'cache-only',
  })

  const favicon = page.meta.favicon ?? defaultFavicon
  const { title, description, keywords, socialImage } = page.meta
  const { canonicalUrl, isIndexingBlocked } = page.seo

  const fontFamilyParamValue = useMemo(() => {
    if (siteData?.site == null) {
      return page.fonts
        .map(({ family, variants }) => {
          return `${family.replace(/ /g, '+')}:${variants.join()}`
        })
        .join('|')
    }

    return siteData.site.googleFonts.edges
      .filter((edge): edge is NonNullable<typeof edge> => edge != null)
      .map(({ activeVariants, node: { family, variants } }) => {
        const activeVariantSpecifiers = variants
          .filter(variant =>
            activeVariants.some(activeVariant => activeVariant.specifier === variant.specifier),
          )
          .map(variant => variant.specifier)
          .join()

        return `${family.replace(/ /g, '+')}:${activeVariantSpecifiers}`
      })
      .join('|')
  }, [siteData, page])

  // Site is premium by default.
  const isPremiumSite = page.site?.premium ?? true

  const filteredSnippets = useMemo(() => {
    return [
      ...snippets.filter(snippet => (preview ? snippet.builderEnabled : snippet.liveEnabled)),
      ...(isPremiumSite ? [] : [MakeswiftBadgeSnippet]),
    ]
  }, [snippets, preview, isPremiumSite])
  const headSnippets = useMemo(
    () => filteredSnippets.filter(snippet => snippet.location === SnippetLocation.Head),
    [filteredSnippets],
  )

  const previousHeadSnippets = useRef<PageData['snippets'] | null>(null)
  useEffect(() => {
    const headSnippetsToCleanUp = (previousHeadSnippets.current ?? [])
      .filter(previousSnippet => previousSnippet.cleanup != null)
      .filter(previousSnippet => !headSnippets.some(snippet => previousSnippet.id === snippet.id))

    headSnippetsToCleanUp.forEach(snippetToCleanUp => {
      if (snippetToCleanUp.cleanup == null) return

      const cleanUp = new Function(snippetToCleanUp.cleanup)

      try {
        cleanUp()
      } catch {
        // Ignore errors from user input.
      }
    })

    previousHeadSnippets.current = headSnippets
  }, [headSnippets])

  return (
    <>
      <Head>
        <style>
          {`
            html {
              font-family: sans-serif;
            }
            div#__next {
              overflow: hidden;
            }
          `}
        </style>

        <link rel="icon" type={favicon.mimetype} href={favicon.publicUrl} />

        {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

        {isIndexingBlocked && <meta name="robots" content="noindex" />}

        {title && (
          <>
            <title>{title}</title>
            <meta property="og:title" content={title} />
            <meta name="twitter:title" content={title} />
            <meta itemProp="name" content={title} />
          </>
        )}

        {description && (
          <>
            <meta name="description" content={description} />
            <meta property="og:description" content={description} />
            <meta name="twitter:description" content={description} />
            <meta itemProp="description" content={description} />
          </>
        )}

        {keywords && <meta name="keywords" content={keywords} />}

        {socialImage && (
          <>
            <meta property="og:image" content={socialImage.publicUrl} />
            <meta property="og:image:type" content={socialImage.publicUrl} />
            <meta name="twitter:image" content={socialImage.publicUrl} />
            <meta name="twitter:card" content={socialImage.publicUrl} />
            <meta itemProp="image" content={socialImage.publicUrl} />
          </>
        )}

        {fontFamilyParamValue !== '' && (
          <>
            <link
              rel="stylesheet"
              href={`https://fonts.googleapis.com/css?family=${fontFamilyParamValue}&display=swap`}
            />
          </>
        )}

        {headSnippets.map(snippetToElement).map(children =>
          Children.map(children, child => {
            if (typeof child === 'string') return child

            if (VALID_HEAD_ELEMENT_TYPES.includes(child.type as string)) return child

            return null
          }),
        )}
      </Head>

      <DocumentReference documentReference={createDocumentReference(page.id)} />

      {filteredSnippets
        .filter(snippet => snippet.location === SnippetLocation.Body)
        .map(snippet => (
          <BodySnippet key={snippet.id} code={snippet.code} cleanup={snippet.cleanup} />
        ))}
    </>
  )
}
