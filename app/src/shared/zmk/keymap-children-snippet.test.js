const { parseBehaviorChildrenSnippet } = require('./keymap-code')
const { renderBehaviorChildrenSnippet } = require('./keymap')

describe('behavior children snippet parser', () => {
  test('parses sibling and nested child nodes', () => {
    const parsed = parseBehaviorChildrenSnippet(`
first_label: first_node {
    bindings = <&kp A>, <&kp B>;
    nested_label: nested_node {
        flag;
    };
};
second_node {
    value = <3>;
};
`)

    expect(parsed).toHaveLength(2)
    expect(parsed[0].label).toBe('first_label')
    expect(parsed[0].name).toBe('first_node')
    expect(parsed[0].children).toHaveLength(1)
    expect(parsed[0].children[0].label).toBe('nested_label')
    expect(parsed[1].name).toBe('second_node')
  })

  test('returns empty array for blank input', () => {
    expect(parseBehaviorChildrenSnippet('')).toEqual([])
    expect(parseBehaviorChildrenSnippet('   \n  ')).toEqual([])
  })

  test('throws for invalid syntax', () => {
    expect(() => parseBehaviorChildrenSnippet('broken_node { value = <1>;')).toThrow()
  })

  test('throws when top-level property exists', () => {
    expect(() => parseBehaviorChildrenSnippet('value = <1>;')).toThrow(/child nodes only/i)
  })

  test('round-trips through renderer', () => {
    const input = `
alpha: first_node {
    bindings = <&kp A>, <&kp B>;
    child_node {
        amount = <2>;
    };
};
`
    const parsed = parseBehaviorChildrenSnippet(input)
    const rendered = renderBehaviorChildrenSnippet(parsed)
    const reparsed = parseBehaviorChildrenSnippet(rendered)

    expect(reparsed).toEqual(parsed)
  })
})
