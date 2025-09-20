"""
Rust extensions for Pokercraft Local.
When you want to use the submodules in Python,
you should import them as

```python
from pokercraft_local.rust import ...
```

because these modules are not qualified as packages.
"""

from . import bankroll, card, equity
