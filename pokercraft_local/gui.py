import tkinter as tk
import typing
from pathlib import Path
from tkinter import filedialog
from tkinter.font import Font
from tkinter.messagebox import showinfo, showwarning

from .constants import VERSION
from .export import export as export_main
from .translate import GUI_EXPORTED_SUCCESS, Language, translate_to


class PokerCraftLocalGUI:
    """
    Represents the GUI of Pokercraft Local.
    """

    def __init__(self) -> None:
        self._window: tk.Tk = tk.Tk()
        self._window.title(f"PokerCraft Local v{VERSION} - By McDic")
        self._window.geometry("400x280")
        self._window.resizable(False, False)

        # Language selection
        self._label_language_selection: tk.Label = tk.Label(
            self._window, text="label_language_selection"
        )
        self._label_language_selection.pack()
        self._strvar_language_selection: tk.StringVar = tk.StringVar(value="en")
        self._menu_language_selection: tk.OptionMenu = tk.OptionMenu(
            self._window,
            self._strvar_language_selection,
            *[lang.value for lang in Language],
            command=lambda strvar: self.reset_display_by_language(strvar),
        )
        self._menu_language_selection.pack()

        # Target directory
        self._label_data_directory: tk.Label = tk.Label(
            self._window, text="label_data_directory"
        )
        self._label_data_directory.pack()
        self._button_data_directory: tk.Button = tk.Button(
            self._window,
            text="button_data_directory",
            command=self.choose_data_directory,
        )
        self._button_data_directory.pack()
        self._data_directory: Path | None = None

        # Output directory
        self._label_output_directory: tk.Label = tk.Label(
            self._window, text="labal_output_directory"
        )
        self._label_output_directory.pack()
        self._button_output_directory: tk.Button = tk.Button(
            self._window,
            text="button_output_directory",
            command=self.choose_output_directory,
        )
        self._button_output_directory.pack()
        self._output_directory: Path | None = None

        # Nickname input
        self._label_nickname: tk.Label = tk.Label(self._window, text="label_nickname")
        self._label_nickname.pack()
        self._input_nickname: tk.Entry = tk.Entry(self._window)
        self._input_nickname.pack()

        # Allow freerolls
        self._boolvar_allow_freerolls: tk.BooleanVar = tk.BooleanVar(self._window)
        self._checkbox_allow_freerolls: tk.Checkbutton = tk.Checkbutton(
            self._window,
            text="checkbox_allow_freerolls",
            variable=self._boolvar_allow_freerolls,
            onvalue=True,
            offvalue=False,
        )
        self._checkbox_allow_freerolls.pack()

        # Use realtime forex conversion
        self._boolvar_fetch_forex: tk.BooleanVar = tk.BooleanVar(self._window)
        self._checkbox_fetch_forex: tk.Checkbutton = tk.Checkbutton(
            self._window,
            text="checkbox_fetch_forex",
            variable=self._boolvar_fetch_forex,
            onvalue=True,
            offvalue=False,
        )
        self._checkbox_fetch_forex.pack()

        # Run button
        self._button_export: tk.Button = tk.Button(
            self._window, text="button_export", command=self.export
        )
        self._window.bind("<Return>", lambda event: self.export())
        self._button_export.pack()

        # Reset display by language
        self.reset_display_by_language(self._strvar_language_selection)

    @staticmethod
    def display_path(path: Path) -> str:
        """
        Display path in a readable way.
        """
        return f".../{path.parent.name}/{path.name}"

    def reset_display_by_language(self, strvar: tk.StringVar | str) -> None:
        """
        Reset display by changed language.
        """
        lang = Language(strvar if isinstance(strvar, str) else strvar.get())
        self._label_language_selection.config(
            text=translate_to(lang, "Select Language"),
        )
        self._label_data_directory.config(
            text=translate_to(lang, "Data Directory: %s")
            % (
                self.display_path(self._data_directory)
                if self._data_directory and self._data_directory.is_dir()
                else "-"
            ),
        )
        self._button_data_directory.config(
            text=translate_to(lang, "Choose Data Directory")
        )
        self._label_output_directory.config(
            text=translate_to(lang, "Output Directory: %s")
            % (
                self.display_path(self._output_directory)
                if self._output_directory and self._output_directory.is_dir()
                else "-"
            ),
        )
        self._button_output_directory.config(
            text=translate_to(lang, "Choose Output Directory")
        )
        self._label_nickname.config(
            text=translate_to(lang, "Your GG nickname"),
        )
        self._checkbox_allow_freerolls.config(
            text=translate_to(lang, "Include Freerolls")
        )
        self._checkbox_fetch_forex.config(
            text=translate_to(lang, "Fetch the latest forex rate (May fail)")
        )
        self._button_export.config(
            text=translate_to(lang, "Export plot and CSV data (Enter)")
        )

    def choose_data_directory(self) -> None:
        """
        Choose a data source directory.
        """
        directory = Path(filedialog.askdirectory())
        if directory.is_dir() and directory.parent != directory:
            self._data_directory = directory
        else:
            self._data_directory = None
            showwarning(
                "Warning from Pokercraft Local",
                f'Given directory "{directory}" is invalid.',
            )
        self.reset_display_by_language(self._strvar_language_selection)

    def choose_output_directory(self) -> None:
        """
        Choose a output directory.
        """
        directory = Path(filedialog.askdirectory())
        if directory.is_dir() and directory.parent != directory:
            self._output_directory = directory
        else:
            self._output_directory = None
            showwarning(
                "Warning from Pokercraft Local",
                f'Given directory "{directory}" is invalid.',
            )
        self.reset_display_by_language(self._strvar_language_selection)

    @staticmethod
    def get_warning_popup_title() -> str:
        """
        Get warning popup title.
        """
        return "Warning!"

    @staticmethod
    def get_info_popup_title() -> str:
        """
        Get information popup title.
        """
        return "Info!"

    def export(self) -> None:
        """
        Export data.
        """
        THIS_LANG = Language(self._strvar_language_selection.get())
        nickname = self._input_nickname.get().strip()
        if not nickname:
            showwarning(
                self.get_warning_popup_title(),
                translate_to(THIS_LANG, "Nickname is not given."),
            )
            return
        elif not self._data_directory or not self._data_directory.is_dir():
            showwarning(
                self.get_warning_popup_title(),
                translate_to(THIS_LANG, "Data directory is not selected or invalid."),
            )
            return
        elif not self._output_directory or not self._output_directory.is_dir():
            showwarning(
                self.get_warning_popup_title(),
                translate_to(THIS_LANG, "Output directory is not selected or invalid."),
            )
            return

        print("\n" + "=" * 60)
        if self._boolvar_allow_freerolls.get():
            print("Allowing freerolls on the graph.")
        else:
            print("Disallowing freerolls on the graph.")

        csv_path, plot_path = export_main(
            main_path=self._data_directory,
            output_path=self._output_directory,
            nickname=nickname,
            allow_freerolls=self._boolvar_allow_freerolls.get(),
            lang=THIS_LANG,
            exclude_csv=False,
            use_realtime_currency_rate=self._boolvar_fetch_forex.get(),
        )
        showinfo(
            self.get_info_popup_title(),
            translate_to(THIS_LANG, GUI_EXPORTED_SUCCESS).format(
                output_dir=self._output_directory,
                csv_path=csv_path.name,
                plot_path=plot_path.name,
            ),
        )

    def run_gui(self) -> None:
        """
        Start GUI.
        """
        self._window.mainloop()
