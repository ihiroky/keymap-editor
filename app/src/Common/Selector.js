import styles from './selector.module.css'

export default function Selector(props) {
  const { id, label, value, choices, onUpdate } = props
  const handleSelect = e => {
    const index = e.target.value
    const choice = choices[index].id
    onUpdate(choice)
  }

  function index(value) {
    const result = choices.findIndex(choice => choice.id === value)
    return result === -1 ? '' : result
  }

  return (
    <div className={styles.selector}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        onChange={handleSelect}
        value={index(value)}
      >
        {choices.map(({ name }, i) => (
          <option key={i} value={i}>{name}</option>
        ))}
      </select>
    </div>
  )
}
