import {
  forwardRef,
  KeyboardEvent,
  Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'

import { createEditor } from 'slate'
import { Slate, Editable, withReact, ReactEditor } from 'slate-react'

import { ElementIDValue, RichTextValue } from '../../../../prop-controllers/descriptors'
import { cx } from '@emotion/css'
import { DescriptorsPropControllers } from '../../../../prop-controllers/instances'
import { Descriptors } from '../../../../runtimes/react/controls/rich-text'
import { getBox } from '../../../../box-model'
import { PropControllersHandle } from '../../../../state/modules/prop-controller-handles'
import { BlockType, RichTextDAO, richTextDTOtoDAO } from '../../../../controls'
import { Leaf } from '../components/Leaf'
import { Element } from '../components/Element'
import { useSyncWithBuilder } from './useSyncWithBuilder'
import isHotkey from 'is-hotkey'
import { useBuilderEditMode } from '../../../../runtimes/react'
import { BuilderEditMode } from '../../../../state/modules/builder-edit-mode'
import { onKeyDown, withBlock, withList, withTypography } from '../../../../slate'
import { pollBoxModel } from '../../../../runtimes/react/poll-box-model'
import { Range as SlateRange } from 'slate'

export const getDefaultView = (value: any): Window | null => {
  return (value && value.ownerDocument && value.ownerDocument.defaultView) || null
}

export const isDOMElement = (value: any): value is Element => {
  return isDOMNode(value) && value.nodeType === 1
}

export const isDOMNode = (value: any): value is Node => {
  const window = getDefaultView(value)
  return !!window && value instanceof window.Node
}

function toDOMRange(editor: ReactEditor, range: SlateRange): Range {
  const { anchor, focus } = range
  const isBackward = SlateRange.isBackward(range)
  const domAnchor = ReactEditor.toDOMPoint(editor, anchor)
  const domFocus = SlateRange.isCollapsed(range) ? domAnchor : ReactEditor.toDOMPoint(editor, focus)

  const window = ReactEditor.getWindow(editor)
  const domRange = window.document.createRange()
  // const [startNode, startOffset] = isBackward ? domFocus : domAnchor
  // const [endNode, endOffset] = isBackward ? domAnchor : domFocus
  const [startNode, startOffset] = domAnchor
  const [endNode, endOffset] = domFocus

  console.log({ isBackward, startOffset, endOffset, domAnchor, domFocus })

  // A slate Point at zero-width Leaf always has an offset of 0 but a native DOM selection at
  // zero-width node has an offset of 1 so we have to check if we are in a zero-width node and
  // adjust the offset accordingly.
  const startEl = (isDOMElement(startNode) ? startNode : startNode.parentElement) as HTMLElement
  const isStartAtZeroWidth = !!startEl.getAttribute('data-slate-zero-width')
  const endEl = (isDOMElement(endNode) ? endNode : endNode.parentElement) as HTMLElement
  const isEndAtZeroWidth = !!endEl.getAttribute('data-slate-zero-width')

  domRange.setStart(startNode, isStartAtZeroWidth ? 1 : startOffset)
  domRange.setEnd(endNode, isEndAtZeroWidth ? 1 : endOffset)
  return domRange
}

export function withPreserveSelection<T extends ReactEditor>(editor: T): T {
  const onChange = editor.onChange

  editor.onChange = options => {
    onChange(options)

    console.log('HJKLHJKLHJKLHJKLHKJLHKJL', options?.operation)

    if (options?.operation == null) {
      setTimeout(() => {
        console.log('attempt to preserve')
        try {
          if (editor.selection == null) return
          const root = ReactEditor.findDocumentOrShadowRoot(editor) as Document
          const selection = root.getSelection()

          if (!selection || selection.toString() !== '') return
          const domRange = toDOMRange(editor, editor.selection)
          selection?.removeAllRanges()
          selection?.addRange(domRange)
        } catch (error) {
          console.error(`Failed to preserve selection: `, error)
        }
      }, 1)
    }
  }

  return editor
}
type Props = {
  id?: ElementIDValue
  text?: RichTextValue
  width?: string
  margin?: string
}

const defaultText: RichTextDAO = [{ type: BlockType.Paragraph, children: [{ text: '' }] }]

export const EditableText = forwardRef(function EditableText(
  { id, text, width, margin }: Props,
  ref: Ref<PropControllersHandle<Descriptors>>,
) {
  const [editor] = useState(() =>
    withPreserveSelection(withBlock(withTypography(withList(withReact(createEditor()))))),
  )
  const delaySync = useSyncWithBuilder(editor, text)
  const editMode = useBuilderEditMode()

  const [propControllers, setPropControllers] =
    useState<DescriptorsPropControllers<Descriptors> | null>(null)
  const controller = propControllers?.text

  useEffect(() => {
    if (controller == null) return

    const element = ReactEditor.toDOMNode(editor, editor)

    return pollBoxModel({
      element,
      onBoxModelChange: boxModel => controller.changeBoxModel(boxModel),
    })
  }, [editor, controller])

  useImperativeHandle(
    ref,
    () => ({
      getDomNode() {
        return ReactEditor.toDOMNode(editor, editor)
      },
      getBoxModel() {
        return getBox(ReactEditor.toDOMNode(editor, editor))
      },
      setPropControllers,
    }),
    [editor, setPropControllers],
  )

  const initialValue = useMemo(() => (text ? richTextDTOtoDAO(text) : defaultText), [text])

  useEffect(() => {
    controller?.setSlateEditor(editor)
  }, [controller, editor])

  const handleFocus = useCallback(() => {
    controller?.focus()
  }, [controller])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isHotkey('mod+shift+z', e)) return controller?.redo()
      if (isHotkey('mod+z', e)) return controller?.undo()
      if (isHotkey('escape')(e)) return controller?.blur()
      onKeyDown(e, editor)
    },
    [controller, editor],
  )

  return (
    <Slate editor={editor} value={initialValue} onChange={delaySync}>
      <Editable
        id={id}
        renderLeaf={Leaf}
        renderElement={Element}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onChange={a => {
          console.log('host - onChange component', a)
        }}
        className={cx(width, margin)}
        readOnly={editMode === BuilderEditMode.INTERACT}
        placeholder="Write some text..."
      />
    </Slate>
  )
})

export default EditableText
