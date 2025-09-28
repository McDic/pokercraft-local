import locale
import logging
import tkinter as tk
from pathlib import Path
from tkinter import filedialog
from tkinter.messagebox import showinfo, showwarning

from .constants import VERSION
from .export import export_hand_history_analysis, export_tourney_summary
from .pypi_query import VERSION_EXTRACTED, get_library_versions
from .translate import Language

logger = logging.getLogger("pokercraft_local.gui")


class PokerCraftLocalGUI:
    """
    Represents the GUI of Pokercraft Local.
    """

    TRKEY_PREFIX = "gui"

    @staticmethod
    def get_default_language() -> Language:
        """
        Get default language by system locale.
        """
        sys_locale, _ = locale.getlocale()
        if sys_locale is None:
            return Language.ENGLISH
        elif sys_locale.startswith("ko"):
            return Language.KOREAN
        else:
            return Language.ENGLISH

    def __init__(self) -> None:
        self._window: tk.Tk = tk.Tk()
        self._window.title(f"Pokercraft Local v{VERSION} - By McDic")
        self._window.geometry("400x360")
        self._window.resizable(False, False)

        # Language selection
        self._label_language_selection: tk.Label = tk.Label(
            self._window, text="label_language_selection"
        )
        self._label_language_selection.pack()
        self._strvar_language_selection: tk.StringVar = tk.StringVar(
            value=self.get_default_language().value
        )
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
            self._window, text="label_output_directory"
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

        # Sampling input
        self._label_hand_sampling: tk.Label = tk.Label(
            self._window, text="label_hand_sampling"
        )
        self._label_hand_sampling.pack()
        self._input_hand_sampling: tk.Entry = tk.Entry(self._window)
        self._input_hand_sampling.pack()
        self._input_hand_sampling.insert(0, "No Limit")

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

        # Export chart button
        self._button_export_chart: tk.Button = tk.Button(
            self._window,
            text="button_export",
            command=self.export_chart,
        )
        self._button_export_chart.pack()

        # Hand history analysis button
        self._button_analyze_hand_history: tk.Button = tk.Button(
            self._window,
            text="button_analyze_hand_history",
            command=self.analyze_hand_history,
        )
        self._button_analyze_hand_history.pack()

        # Reset display by language
        self.reset_display_by_language(self._strvar_language_selection)

    @staticmethod
    def display_path(path: Path) -> str:
        """
        Display path in a readable way.
        """
        return f".../{path.parent.name}/{path.name}"

    def get_lang(self) -> Language:
        """
        Get current selected language.
        """
        return Language(self._strvar_language_selection.get())

    def reset_display_by_language(self, strvar: tk.StringVar | str) -> None:
        """
        Reset display by changed language.
        """
        lang = Language(strvar if isinstance(strvar, str) else strvar.get())
        self._label_language_selection.config(
            text=lang << f"{self.TRKEY_PREFIX}.select_language"
        )
        self._label_data_directory.config(
            text=(lang << f"{self.TRKEY_PREFIX}.data_directory")
            % (
                self.display_path(self._data_directory)
                if self._data_directory and self._data_directory.is_dir()
                else "-"
            ),
        )
        self._button_data_directory.config(
            text=lang << f"{self.TRKEY_PREFIX}.choose_data_directory"
        )
        self._label_output_directory.config(
            text=(lang << f"{self.TRKEY_PREFIX}.output_directory")
            % (
                self.display_path(self._output_directory)
                if self._output_directory and self._output_directory.is_dir()
                else "-"
            ),
        )
        self._button_output_directory.config(
            text=lang << f"{self.TRKEY_PREFIX}.choose_output_directory"
        )
        self._label_nickname.config(
            text=lang << f"{self.TRKEY_PREFIX}.your_gg_nickname"
        )
        self._label_hand_sampling.config(
            text=lang << f"{self.TRKEY_PREFIX}.hand_sampling"
        )
        self._checkbox_allow_freerolls.config(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.include_freerolls"
        )
        self._checkbox_fetch_forex.config(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.fetch_forex_rate"
        )
        self._button_export_chart.config(
            text=lang << f"{self.TRKEY_PREFIX}.export_buttons.tourney_summary"
        )
        self._button_analyze_hand_history.config(
            text=lang << f"{self.TRKEY_PREFIX}.export_buttons.hand_history"
        )

    def choose_data_directory(self) -> None:
        """
        Choose a data source directory.
        """
        THIS_LANG = self.get_lang()
        directory = Path(filedialog.askdirectory())
        if directory.is_dir() and directory.parent != directory:
            self._data_directory = directory
        else:
            self._data_directory = None
            showwarning(
                self.get_warning_popup_title(),
                (
                    THIS_LANG
                    << f"{self.TRKEY_PREFIX}.error_messages.invalid_given_directory"
                )
                % (directory,),
            )
        self.reset_display_by_language(self._strvar_language_selection)

    def choose_output_directory(self) -> None:
        """
        Choose a output directory.
        """
        THIS_LANG = self.get_lang()
        directory = Path(filedialog.askdirectory())
        if directory.is_dir() and directory.parent != directory:
            self._output_directory = directory
        else:
            self._output_directory = None
            showwarning(
                self.get_warning_popup_title(),
                (
                    THIS_LANG
                    << f"{self.TRKEY_PREFIX}.error_messages.invalid_given_directory"
                )
                % (directory,),
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

    def get_important_inputs(self) -> tuple[str, Path, Path] | None:
        """
        Get input values - nickname, data directory, output directory.
        """
        THIS_LANG = self.get_lang()
        nickname = self._input_nickname.get().strip()
        if not nickname:
            showwarning(
                self.get_warning_popup_title(),
                THIS_LANG << f"{self.TRKEY_PREFIX}.error_messages.nickname_not_given",
            )
            return None
        elif not self._data_directory or not self._data_directory.is_dir():
            showwarning(
                self.get_warning_popup_title(),
                THIS_LANG
                << f"{self.TRKEY_PREFIX}.error_messages.invalid_data_directory",
            )
            return None
        elif not self._output_directory or not self._output_directory.is_dir():
            showwarning(
                self.get_warning_popup_title(),
                THIS_LANG
                << f"{self.TRKEY_PREFIX}.error_messages.invalid_output_directory",
            )
            return None
        return nickname, self._data_directory, self._output_directory

    def export_chart(self) -> None:
        """
        Export the visualization charts.
        """
        THIS_LANG = self.get_lang()
        if (res := self.get_important_inputs()) is not None:
            nickname, data_directory, output_directory = res
        else:
            return None

        if self._boolvar_allow_freerolls.get():
            logging.info("Allowing freerolls on the graph.")
        else:
            logging.info("Disallowing freerolls on the graph.")

        csv_path, plot_path = export_tourney_summary(
            main_path=data_directory,
            output_path=output_directory,
            nickname=nickname,
            allow_freerolls=self._boolvar_allow_freerolls.get(),
            lang=THIS_LANG,
            exclude_csv=False,
            use_realtime_currency_rate=self._boolvar_fetch_forex.get(),
        )
        showinfo(
            self.get_info_popup_title(),
            (THIS_LANG << f"{self.TRKEY_PREFIX}.exported.tourney_summary").format(
                output_dir=self._output_directory,
                csv_path=csv_path.name,
                plot_path=plot_path.name,
            ),
        )

    def get_hand_sampling_limit(self) -> int | None:
        """
        Get hand sampling limit.
        """
        raw_line = self._input_hand_sampling.get().strip().lower()
        if raw_line == "no limit":
            return None
        max_sampling = int(raw_line)
        if max_sampling <= 0:
            raise ValueError("Non-positive integer given")
        return max_sampling

    def analyze_hand_history(self) -> None:
        """
        Analyze hand history files.
        """
        THIS_LANG = self.get_lang()
        if (res := self.get_important_inputs()) is not None:
            nickname, data_directory, output_directory = res
        else:
            return None

        max_sampling: int | None = None
        try:
            max_sampling = self.get_hand_sampling_limit()
        except ValueError:
            showwarning(
                self.get_warning_popup_title(),
                (
                    THIS_LANG
                    << (
                        f"{self.TRKEY_PREFIX}.error_messages."
                        "invalid_hand_sampling_number"
                    )
                )
                % (self._input_hand_sampling.get().strip(),),
            )
            return None
        logging.info(f"Sampling up to {max_sampling} hand histories.")

        plot_path = export_hand_history_analysis(
            main_path=data_directory,
            output_path=output_directory,
            nickname=nickname,
            lang=THIS_LANG,
            max_sampling=max_sampling,
        )
        showinfo(
            self.get_info_popup_title(),
            (THIS_LANG << f"{self.TRKEY_PREFIX}.exported.hand_history").format(
                output_dir=output_directory,
                plot_path=plot_path.name,
            ),
        )

    def run_gui(self) -> None:
        """
        Start GUI.
        """
        THIS_LANG = self.get_lang()
        if VERSION_EXTRACTED < (NEWEST_VERSION := max(get_library_versions())):
            showwarning(
                self.get_warning_popup_title(),
                (THIS_LANG << f"{self.TRKEY_PREFIX}.error_messages.outdated_version")
                % (VERSION_EXTRACTED + NEWEST_VERSION),
            )
        self._window.mainloop()
