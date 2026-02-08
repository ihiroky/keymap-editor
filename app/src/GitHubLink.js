import Icon from './Common/Icon'

export default function GitHubLink(props = {}) {
  return (
    <a
      target="_blank"
      rel="noreferrer"
      href="https://github.com/ihiroky/keymap-editor"
      {...props}
    >
      <Icon collection="brands" name="github" />/ihiroky/keymap-editor
    </a>
  )
}
