import logging

from pokercraft_local.gui import PokerCraftLocalGUI

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    PokerCraftLocalGUI().run_gui()
