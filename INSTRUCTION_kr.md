# Pokercraft Local 사용 가이드 (한국어)

*This document is a user guide for Korean non-programmers.*

이 문서는 Pokercraft Local을 사용하는 가이드를 담고 있습니다.
이 문서의 타겟 독자층은 프로그래밍을 잘 모르는 한국인입니다.
일반적인 개발자를 위한 문서는 [README.md](README.md)를 참조해주세요.

Pokercraft Local을 활용해서 나온 분석파일들의 데모는 다음 링크들을 통해 보실 수 있습니다.
(제꺼 데이터로 만든 분석파일들입니다.)

- [토너먼트 결과 분석 데모](https://blog.mcdic.net/assets/raw_html/damavaco_performance_kr.html)
- [핸드 히스토리 분석 데모](https://blog.mcdic.net/assets/raw_html/damavaco_handhistories_kr.html)

## 프로그램 다운로드 받기

[Github Releases](https://github.com/McDic/pokercraft-local/releases) 페이지에 들어가서 가장 최신버젼의 `.zip` 파일을 다운로드 받으시면 됩니다.
`.zip` 파일 안에는 `.exe` 파일이 있습니다.
참고로, 현재는 윈도우 64비트에서 돌아가는 프로그램만 `.exe`로 제공하고 있습니다.
다른 운영체제(MacOS 등)에서 실행하시려면, 프로그래밍 언어 Python을 직접 사용하셔야 합니다.

## 데이터 준비하기

Pokercraft Local에 쓰일 수 있는 데이터는 2가지입니다.
*Pokercraft - My Tournaments* 섹션에 들어가면 다음 2가지 종류의 데이터를 다운받으실 수 있습니다.

![pokercraft_tourney](images/pokercraft_download_2.webp)

- 토너 결과(Game Summaries): 위 사진의 초록색 다운로드 버튼을 누르면 받는 데이터로, 토너먼트 결과 분석에 쓰일 데이터입니다. 웹사이트 상 데이터의 유효기간은 12개월입니다.
- 핸드 히스토리(Game Histories): 위 사진의 빨간색 다운로드 버튼을 누르면 받는 데이터로, 핸드 히스토리 분석에 쓰일 데이터입니다. 웹사이트 상 데이터의 유효기간은 3개월입니다.

핸드 히스토리 같은 데이터는 주기적으로 컴퓨터에 다운받아서 쌓아두시는 것을 추천합니다.
데이터 `.zip` 파일을 받으시면, 압축해제 하지 마시고 그냥 `.zip` 상태로 놔두세요.
(옛날 버젼에서는 `.zip` 파일을 압축해제 했어야 하지만, 이제는 알아서 `.zip` 파일 내부에서 데이터 찾아줍니다.)

## GUI 실행하기

맨 처음 프로그램을 실행하면 기본 설정이 영어로 뜰 겁니다.

![gui_screen_en](images/gui_screen_en_2.2.2.png)

여기서 "*Select Language*" 버튼을 눌러서 `en` (English)을 `ko` (Korean)로 바꿔줍시다.

![gui_screen_kr](images/gui_screen_kr_2.2.2.png)

그럼 이제 한국말로 화면이 뜰 겁니다.
필수 옵션에 대한 설명은 다음과 같습니다.

- **데이터 폴더(Data Directory)**: 포커크래프트에서 다운받은 `.zip` 파일들이 있는 폴더를 선택해주세요.
- **분석파일 내보낼 폴더(Output Directory)**: 분석파일을 내보낼 폴더를 선택해주세요.
- **GG 닉네임(Your GG nickname)**: GG 닉네임을 써주세요. 유효성 검사를 하는 건 아니라서 아무거나 막 써도 되긴 합니다.

이제 원하시는 분석을 해볼 차례입니다.
GUI 화면에서 모든 옵션 페이지를 열면 다음과 같은 모습이 나옵니다.

![gui_screen_kr_expanded](images/gui_screen_kr_2.2.2_expanded.png)

여기서 이제 초록색 다운로드 버튼으로 받은 데이터에는 *"토너먼트 결과 분석"* 을,
빨간색 다운로드 버튼으로 받은 데이터에는 *"핸드 히스토리 분석"* 을 눌러주세요.

---

감사합니다.
