import locale
import logging
import tkinter as tk
import tkinter.ttk as ttk
import webbrowser
from pathlib import Path
from tkinter import filedialog
from tkinter.messagebox import showinfo, showwarning

from .constants import VERSION
from .export import export_hand_history_analysis, export_tourney_summary
from .pypi_query import VERSION_EXTRACTED, get_library_versions
from .translate import Language

logger = logging.getLogger("pokercraft_local.gui")


class BooleanCheckbox:
    """
    Tkinter checkbox wrapper for convenience.
    """

    def __init__(self, master, default: bool = False) -> None:
        self._boolvar = tk.BooleanVar(master, value=default)
        self._checkbox = tk.Checkbutton(
            master, variable=self._boolvar, onvalue=True, offvalue=False
        )
        self._checkbox.pack()

    def get_state(self) -> bool:
        return self._boolvar.get()

    def set_text(self, text: str) -> None:
        self._checkbox.config(text=text)


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

        # Language selection
        self._label_language_selection: tk.Label = tk.Label(
            self._window, text="label_language_selection"
        )
        self._label_language_selection.pack()
        self._strvar_language_selection: tk.StringVar = tk.StringVar(
            value=self.get_default_language().get_gui_select_text()
        )
        self._language_selection_mapping = {
            lang.get_gui_select_text(): lang for lang in Language
        }
        self._menu_language_selection: tk.OptionMenu = tk.OptionMenu(
            self._window,
            self._strvar_language_selection,
            *[lang.get_gui_select_text() for lang in Language],
            command=lambda strvar: self.reset_display_by_language(strvar),
        )
        self._menu_language_selection.pack()
        self._separator_after_lang_selection = self.create_hr(self._window)

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

        # Etc settings
        self._separator_before_etc_settings = self.create_hr(self._window)
        self._button_etc_settings: tk.Button = tk.Button(
            self._window,
            text="button_etc_settings",
            command=self._toggle_etc_options,
            anchor="w",
            relief="flat",
        )
        self._button_etc_settings.pack()
        self._frame_etc_settings: tk.Frame = tk.Frame(
            self._window, relief="sunken", bd=1
        )
        self._visibility_etc_options: bool = True
        self._toggle_etc_options()

        # Sampling input
        self._label_hand_sampling: tk.Label = tk.Label(
            self._frame_etc_settings, text="label_hand_sampling"
        )
        self._label_hand_sampling.pack()
        self._input_hand_sampling: tk.Entry = tk.Entry(self._frame_etc_settings)
        self._input_hand_sampling.pack()
        self._input_hand_sampling.insert(0, "No Limit")

        # Allow freerolls
        self._checkbox_allow_freerolls = BooleanCheckbox(
            self._frame_etc_settings, default=False
        )

        # Use realtime forex conversion
        self._checkbox_fetch_forex = BooleanCheckbox(
            self._frame_etc_settings, default=False
        )

        # Tourney summary analysis section
        self._separator_before_analyze_summary = self.create_hr(self._window)
        self._button_expand_analyze_summary: tk.Button = tk.Button(
            self._window,
            text="button_analyze_summary_section",
            anchor="w",
            relief="flat",
            command=self._toggle_analyze_summary,
        )
        self._button_expand_analyze_summary.pack()
        self._frame_analyze_summary_section = tk.Frame(
            self._window, relief="sunken", bd=1
        )
        self._visibility_analyze_summary_section: bool = True
        self._toggle_analyze_summary()
        self._checkbox_summary_historical_performance = BooleanCheckbox(
            self._frame_analyze_summary_section, default=True
        )
        self._checkbox_summary_rre_heatmaps = BooleanCheckbox(
            self._frame_analyze_summary_section, default=False
        )
        self._checkbox_summary_bankroll = BooleanCheckbox(
            self._frame_analyze_summary_section, default=True
        )
        self._checkbox_summary_prize_chart = BooleanCheckbox(
            self._frame_analyze_summary_section, default=True
        )
        self._checkbox_summary_rr_by_percentile = BooleanCheckbox(
            self._frame_analyze_summary_section, default=True
        )
        self._button_analyze_summary: tk.Button = tk.Button(
            self._frame_analyze_summary_section,
            text="button_analyze_summary",
            command=self.analyze_summary,
        )
        self._button_analyze_summary.pack(pady=5)

        # Hand history analysis section
        self._separator_before_analyze_hand_history = self.create_hr(self._window)
        self._button_expand_hand_history: tk.Button = tk.Button(
            self._window,
            text="button_analyze_hand_history_section",
            anchor="w",
            relief="flat",
            command=self._toggle_analyze_hand_history,
        )
        self._button_expand_hand_history.pack()
        self._frame_hand_history_section = tk.Frame(self._window, relief="sunken", bd=1)
        self._visibility_hand_history_section: bool = True
        self._toggle_analyze_hand_history()
        self._checkbox_hand_history_all_in_equities = BooleanCheckbox(
            self._frame_hand_history_section, default=True
        )
        self._checkbox_hand_history_chip_histories = BooleanCheckbox(
            self._frame_hand_history_section, default=True
        )
        self._checkbox_hand_history_hand_usage_by_positions = BooleanCheckbox(
            self._frame_hand_history_section, default=True
        )
        self._button_analyze_hand_history: tk.Button = tk.Button(
            self._frame_hand_history_section,
            text="button_analyze_hand_history",
            command=self.analyze_hand_history,
        )
        self._button_analyze_hand_history.pack(pady=5)

        # Credits button
        self._separator_before_credits = self.create_hr(self._window)
        self._button_credits: tk.Button = tk.Button(
            self._window,
            text="button_credits",
            command=self._open_credits,
        )
        self._button_credits.pack()

        # Reset display by language
        self.reset_display_by_language(self._strvar_language_selection)
        self.resize()

    @staticmethod
    def create_hr(master) -> ttk.Separator:
        """
        Create a horizontal separator.
        """
        separator = ttk.Separator(master, orient="horizontal")
        separator.pack(fill="x", pady=10)
        return separator

    def resize(self) -> None:
        """
        Resize entire GUI.
        """
        self._window.update_idletasks()  # Calculate required size
        self._window.minsize(
            self._window.winfo_reqwidth(),
            self._window.winfo_reqheight(),
        )

    def _open_credits(self) -> None:
        try:
            webbrowser.open("https://github.com/McDic/pokercraft-local")
        except Exception as e:
            showwarning(
                self.get_warning_popup_title(),
                (
                    self.get_lang()
                    << f"{self.TRKEY_PREFIX}.error_messages.cannot_open_browser"
                )
                % (str(e),),
            )

    def _toggle_etc_options(self) -> None:
        """
        Toggle etc options visibility.
        """
        self._visibility_etc_options = not self._visibility_etc_options
        if not self._visibility_etc_options:
            self._frame_etc_settings.pack_forget()
        else:
            self._frame_etc_settings.pack(after=self._button_etc_settings)
        self.resize()

    def _toggle_analyze_summary(self) -> None:
        """
        Toggle analyze summary section.
        """
        self._visibility_analyze_summary_section = (
            not self._visibility_analyze_summary_section
        )
        if not self._visibility_analyze_summary_section:
            self._frame_analyze_summary_section.pack_forget()
        else:
            self._frame_analyze_summary_section.pack(
                after=self._button_expand_analyze_summary
            )
        self.resize()

    def _toggle_analyze_hand_history(self) -> None:
        """
        Toggle analyze hand history section.
        """
        self._visibility_hand_history_section = (
            not self._visibility_hand_history_section
        )
        if not self._visibility_hand_history_section:
            self._frame_hand_history_section.pack_forget()
        else:
            self._frame_hand_history_section.pack(
                after=self._button_expand_hand_history
            )
        self.resize()

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
        return self._language_selection_mapping[self._strvar_language_selection.get()]

    def reset_display_by_language(self, strvar: tk.StringVar | str) -> None:
        """
        Reset display by changed language.
        """
        lang = self._language_selection_mapping[
            strvar if isinstance(strvar, str) else strvar.get()
        ]
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
        self._checkbox_allow_freerolls.set_text(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.include_freerolls"
        )
        self._checkbox_fetch_forex.set_text(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.fetch_forex_rate"
        )
        self._button_analyze_summary.config(
            text=lang << f"{self.TRKEY_PREFIX}.export_buttons.tourney_summary"
        )
        self._button_analyze_hand_history.config(
            text=lang << f"{self.TRKEY_PREFIX}.export_buttons.hand_history"
        )
        self._button_etc_settings.config(
            text="▼ " + (lang << f"{self.TRKEY_PREFIX}.sections.etc_settings")
        )
        self._button_expand_analyze_summary.config(
            text="▼ " + (lang << f"{self.TRKEY_PREFIX}.sections.tourney_summary")
        )
        self._checkbox_summary_historical_performance.set_text(
            text=lang
            << f"{self.TRKEY_PREFIX}.checkboxes.tourney_summary.historical_performance"
        )
        self._checkbox_summary_rre_heatmaps.set_text(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.tourney_summary.rre_heatmaps"
        )
        self._checkbox_summary_bankroll.set_text(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.tourney_summary.bankroll"
        )
        self._checkbox_summary_prize_chart.set_text(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.tourney_summary.prize_chart"
        )
        self._checkbox_summary_rr_by_percentile.set_text(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.tourney_summary.rr_by_rank"
        )
        self._button_expand_hand_history.config(
            text="▼ " + (lang << f"{self.TRKEY_PREFIX}.sections.hand_history")
        )
        self._checkbox_hand_history_all_in_equities.set_text(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.hand_history.all_in_equity"
        )
        self._checkbox_hand_history_chip_histories.set_text(
            text=lang << f"{self.TRKEY_PREFIX}.checkboxes.hand_history.chip_histories"
        )
        self._checkbox_hand_history_hand_usage_by_positions.set_text(
            text=lang
            << f"{self.TRKEY_PREFIX}.checkboxes.hand_history.hand_usage_by_positions"
        )
        self._button_credits.config(text=lang << f"{self.TRKEY_PREFIX}.credits")

        # Resize GUI because text might be changed
        self.resize()

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

    def analyze_summary(self) -> None:
        """
        Export the visualization charts.
        """
        THIS_LANG = self.get_lang()
        if (res := self.get_important_inputs()) is not None:
            nickname, data_directory, output_directory = res
        else:
            return None

        if self._checkbox_allow_freerolls.get_state():
            logging.info("Allowing freerolls on the graph.")
        else:
            logging.info("Disallowing freerolls on the graph.")

        toggling_masks = [
            self._checkbox_summary_historical_performance.get_state(),
            self._checkbox_summary_rre_heatmaps.get_state(),
            self._checkbox_summary_bankroll.get_state(),
            self._checkbox_summary_prize_chart.get_state(),
            self._checkbox_summary_rr_by_percentile.get_state(),
        ]
        if not any(toggling_masks):
            showwarning(
                self.get_warning_popup_title(),
                THIS_LANG << f"{self.TRKEY_PREFIX}.error_messages.all_charts_disabled",
            )
            return None

        csv_path, plot_path = export_tourney_summary(
            main_path=data_directory,
            output_path=output_directory,
            nickname=nickname,
            allow_freerolls=self._checkbox_allow_freerolls.get_state(),
            lang=THIS_LANG,
            exclude_csv=False,
            use_realtime_currency_rate=self._checkbox_fetch_forex.get_state(),
            toggling_masks=toggling_masks,
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

        toggling_masks = [
            self._checkbox_hand_history_all_in_equities.get_state(),
            self._checkbox_hand_history_chip_histories.get_state(),
            self._checkbox_hand_history_hand_usage_by_positions.get_state(),
        ]
        if not any(toggling_masks):
            showwarning(
                self.get_warning_popup_title(),
                THIS_LANG << f"{self.TRKEY_PREFIX}.error_messages.all_charts_disabled",
            )
            return None

        plot_path = export_hand_history_analysis(
            main_path=data_directory,
            output_path=output_directory,
            nickname=nickname,
            lang=THIS_LANG,
            max_sampling=max_sampling,
            toggling_masks=toggling_masks,
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
