# Contributing

This is a **study project** focused on learning usage-based billing systems. Contributions, questions, and discussions are welcome!

## Ways to Contribute

### 1. Share Better Approaches

Found a better way to handle:
- Event-time windowing?
- Re-rating workflows?
- Price book versioning?
- Deterministic calculations?

**Open an issue or PR** with your approach and reasoning.

---

### 2. Report Issues

Found problems with:
- Conceptual understanding?
- Implementation bugs?
- Documentation clarity?
- Missing edge cases?

**Open an issue** with:
- Clear description
- Steps to reproduce (if code bug)
- Expected vs actual behavior

---

### 3. Improve Documentation

- Fix typos or unclear explanations
- Add examples or diagrams
- Expand on trade-offs
- Link to relevant resources

---

### 4. Discuss Trade-Offs

Architecture decisions involve trade-offs. Let's discuss:
- Why this approach vs alternatives?
- What production systems do differently?
- What complexity is worth the benefit?

**Use GitHub Discussions** for open-ended conversations.

---

## What We're NOT Looking For

### Production-Grade Features

This is a learning project, not a production billing system. We intentionally:
- Simplify error handling
- Skip performance optimization
- Omit edge cases
- Focus on core concepts

If you want to add auth, multi-tenancy, ML forecasting, etc., that's better as a separate fork.

---

### "Best Practices" Without Context

"You should use X" isn't helpful without explaining:
- **Why**: What problem does it solve?
- **Trade-offs**: What do we gain/lose?
- **Context**: When does this matter?

---

## Development Setup

```bash
# Clone
git clone https://github.com/[your-username]/invoicing-pipeline.git
cd invoicing-pipeline

# Install dependencies
npm install

# Start infrastructure
npm run env:start

# Run migrations
npm run migration:run

# Run tests
npm test

# Start dev server
npm run dev
```

---

## Code Standards

### TypeScript

- **Strict mode enabled**: No implicit any
- **Explicit types**: Function parameters and returns
- **Functional style**: Prefer pure functions over mutations

### Testing

- **Test behavior, not implementation**
- **Use descriptive test names**: "should X when Y"
- **Test edge cases**: Zero, negative, boundary conditions
- **Mock time**: Never use `Date.now()` directly

### Documentation

- **Explain trade-offs** in code comments
- **Link to relevant docs** for complex logic
- **Update docs** when changing behavior

---

## Pull Request Process

1. **Fork** the repository
2. **Create branch**: `git checkout -b feature/your-feature`
3. **Make changes** with tests
4. **Run linter**: `npm run lint`
5. **Run tests**: `npm test`
6. **Push**: `git push origin feature/your-feature`
7. **Open PR** with clear description

### PR Template

```markdown
## What

Brief description of changes

## Why

What problem does this solve?

## Trade-offs

What did we gain? What did we lose?

## Testing

How was this tested?

## Related

Links to issues, discussions, or docs
```

---

## Questions & Discussions

### GitHub Issues

For bugs, documentation improvements, or specific problems.

### GitHub Discussions

For:
- Architecture questions
- Trade-off discussions
- "How would you handle X?" questions
- Learning resources

### What NOT to Ask

- "Will you add feature X?" - Probably not (study project)
- "Can you do my homework?" - No
- "How do I install Node.js?" - See Node.js docs

---

## Code of Conduct

### Be Constructive

- ✅ "This approach has issue X because Y. Consider Z instead."
- ❌ "This is wrong and dumb."

### Be Curious

- ✅ "Why did you choose approach X over Y?"
- ❌ "You should have used Y."

### Be Respectful

We're all learning. Assume good intent.

---

## Recognition

Contributors will be:
- Listed in README (if desired)
- Credited in relevant documentation
- Thanked profusely

---

## License

By contributing, you agree that your contributions will be unlicensed (public domain). See README for license details.

---

## Getting Help

Stuck? Questions?

1. Check [documentation](docs/)
2. Search [existing issues](https://github.com/[your-username]/invoicing-pipeline/issues)
3. Open new issue with clear description

---

**Remember**: This is a learning exercise. We value curiosity, clarity, and constructive feedback. Perfect code isn't the goal—understanding the problems is.

