const styles = {
  dialog: {
    backgroundColor: 'var(--theme-surface-1)',
    color: 'var(--theme-text)',
    border: '1px solid var(--theme-border)',
    padding: '20px 40px',
    margin: '40px',
    maxWidth: '500px',
    boxShadow: 'var(--theme-shadow-strong)',
  },
  button: {
    display: 'block',
    margin: '0 auto'
  }
}

export default function DialogBox(props) {
  const { dismissText = 'Ok', onDismiss, children } = props

  return (
    <div style={styles.dialog}>
      {children}
      {dismissText && (
        <button style={styles.button} onClick={onDismiss}>
          {dismissText}
        </button>
      )}
    </div>
  )
}
