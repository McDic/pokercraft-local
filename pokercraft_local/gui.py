import tkinter as tk
import typing
from datetime import datetime
from pathlib import Path
from tkinter import filedialog
from tkinter.messagebox import showinfo, showwarning

from .csvdata import export_csv
from .data_structures import TournamentSummary
from .parser import PokercraftParser
from .visualize import plot_total


class PokerCraftLocalGUI:
    """
    Represents the GUI of Pokercraft Local.
    """

    DATA_DIRECTORY_NOT_SELECTED: typing.Final[str] = "Data Directory not selected"
    OUTPUT_DIRECTORY_NOT_SELECTED: typing.Final[str] = "Output Directory not selected"

    def __init__(self) -> None:
        self._window: tk.Tk = tk.Tk()
        self._window.title("PokerCraft Local - By McDic")
        self._window.geometry("350x175")
        self._window.resizable(False, False)

        # Target directory
        self._label_data_directory: tk.Label = tk.Label(
            self._window, text=self.DATA_DIRECTORY_NOT_SELECTED
        )
        self._label_data_directory.pack()
        self._button_data_directory: tk.Button = tk.Button(
            self._window,
            text="Choose Data Directory",
            command=self.choose_data_directory,
        )
        self._button_data_directory.pack()
        self._data_directory: Path | None = None

        # Output directory
        self._label_output_directory: tk.Label = tk.Label(
            self._window, text=self.OUTPUT_DIRECTORY_NOT_SELECTED
        )
        self._label_output_directory.pack()
        self._button_output_directory: tk.Button = tk.Button(
            self._window,
            text="Choose Output Directory",
            command=self.choose_output_directory,
        )
        self._button_output_directory.pack()
        self._output_directory: Path | None = None

        # Nickname input
        self._label_nickname: tk.Label = tk.Label(self._window, text="Your GG nickname")
        self._label_nickname.pack()
        self._input_nickname: tk.Entry = tk.Entry(self._window)
        self._input_nickname.pack()

        # Run button
        self._button_export: tk.Button = tk.Button(
            self._window, text="Export plot and CSV data (Enter)", command=self.export
        )
        self._window.bind("<Return>", lambda event: self.export())
        self._button_export.pack()

    def choose_data_directory(self) -> None:
        """
        Choose a data source directory.
        """
        directory = Path(filedialog.askdirectory())
        if directory.is_dir() and directory.parent != directory:
            self._data_directory = directory
            self._label_data_directory.config(
                text=f"Data Directory: .../{directory.parent.name}/{directory.name}"
            )
        else:
            self._data_directory = None
            self._label_data_directory.config(text=self.DATA_DIRECTORY_NOT_SELECTED)
            showwarning(
                "Warning from Pokercraft Local",
                f'Given directory "{directory}" is invalid.',
            )

    def choose_output_directory(self) -> None:
        """
        Choose a output directory.
        """
        directory = Path(filedialog.askdirectory())
        if directory.is_dir() and directory.parent != directory:
            self._output_directory = directory
            self._label_output_directory.config(
                text=f"Output Directory: .../{directory.parent.name}"
                f"/{directory.name}"
            )
        else:
            self._output_directory = None
            self._label_output_directory.config(text=self.OUTPUT_DIRECTORY_NOT_SELECTED)
            showwarning(
                "Warning from Pokercraft Local",
                f'Given directory "{directory}" is invalid.',
            )

    def export(self) -> None:
        """
        Export data.
        """
        nickname = self._input_nickname.get().strip()
        if not nickname:
            showwarning("Warning from Pokercraft Local", "Nickname is not given.")
            return
        elif not self._data_directory or not self._data_directory.is_dir():
            showwarning(
                "Warning from Pokercraft Local",
                "Data directory is not selected or not valid.",
            )
            return
        elif not self._output_directory or not self._output_directory.is_dir():
            showwarning(
                "Warning from Pokercraft Local",
                "Output directory is not selected or not valid.",
            )
            return

        # Crawl files
        summaries: list[TournamentSummary] = sorted(
            set(
                PokercraftParser.crawl_files(
                    [self._data_directory], follow_symlink=True
                )
            ),
            key=lambda t: t.sorting_key(),
        )
        current_time_strf = datetime.now().strftime("%Y%m%d_%H%M%S.%f")

        # Export CSV
        csv_path = self._output_directory / f"summaries_{current_time_strf}.csv"
        export_csv(csv_path, summaries)

        # Export plot HTML
        plot_path = self._output_directory / f"result_{current_time_strf}.html"
        with open(plot_path, "w") as html_file:
            html_file.write(plot_total(nickname, summaries))

        # Finished
        showinfo(
            "Info from Pokercraft Local",
            "Exported CSV and plot successfully; "
            f"Please check {csv_path} and {plot_path}.",
        )

    def run_gui(self) -> None:
        """
        Start GUI.
        """
        self._window.mainloop()


def gui_main() -> None:
    """
    Main function for GUI.
    """
    PokerCraftLocalGUI().run_gui()