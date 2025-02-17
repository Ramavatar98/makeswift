/** @jsx jsx */

import { describe, it, expect } from 'vitest'
import { Block } from '..'
import { jsx, Paragraph, Text, Editor, Cursor, Anchor, Focus, Fragment } from '../../test-helpers'

describe('GIVEN setBlockKeyForDevice', () => {
  it('WHEN called on a paragraph THEN textAlign is updated', () => {
    const editor = Editor(
      <Paragraph>
        <Text>
          ab
          <Cursor />c
        </Text>
      </Paragraph>,
    )
    const result = Editor(
      <Paragraph textAlign={[{ deviceId: 'mobile', value: 'right' }]}>
        <Text>
          ab
          <Cursor />c
        </Text>
      </Paragraph>,
    )

    Block.setBlockKeyForDevice(editor, 'mobile', 'textAlign', 'right')

    expect(editor.children).toEqual(result.children)
    expect(editor.selection).toEqual(result.selection)
  })

  it('WHEN called on a group of element THEN textAlign is updated', () => {
    const editor = Editor(
      <Fragment>
        <Paragraph textAlign={[{ deviceId: 'desktop', value: 'right' }]}>
          <Text>
            ab
            <Anchor />c
          </Text>
        </Paragraph>
        <Paragraph>
          <Text>
            ab
            <Focus />c
          </Text>
        </Paragraph>
      </Fragment>,
    )
    const result = Editor(
      <Fragment>
        <Paragraph
          textAlign={[
            { deviceId: 'desktop', value: 'right' },
            { deviceId: 'mobile', value: 'right' },
          ]}
        >
          <Text>
            ab
            <Anchor />c
          </Text>
        </Paragraph>
        <Paragraph textAlign={[{ deviceId: 'mobile', value: 'right' }]}>
          <Text>
            ab
            <Focus />c
          </Text>
        </Paragraph>
      </Fragment>,
    )

    Block.setBlockKeyForDevice(editor, 'mobile', 'textAlign', 'right')

    expect(editor.children).toEqual(result.children)
    expect(editor.selection).toEqual(result.selection)
  })
})
