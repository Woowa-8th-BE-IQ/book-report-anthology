# 배경음 출처

펫의 배경음(`static/sounds`, `static/js/ambience.js`)에 쓰는 소리입니다.

## 녹음 (Freesound, CC0 1.0)

모두 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)(퍼블릭 도메인)입니다. 출처 표기 의무는 없지만 감사의 뜻으로 남깁니다.
[asmeul](https://github.com/jebiyeon02/asmeul)의 `SOUND_CREDITS.md`에서 CC0으로 확인된 녹음만 골랐습니다. 크기를 맞추려고 음량을 고르게(loudnorm −26 LUFS) 하고 96kbps로 다시 인코딩했습니다.

| 파일 | 화면 이름 | 원본 / 녹음한 사람 | 출처 |
| --- | --- | --- | --- |
| rain.mp3 | 빗소리 | Rain (Heavy) From open window / KaleidacousticsAudio | https://freesound.org/people/KaleidacousticsAudio/sounds/630424/ |
| lake.mp3 | 호숫가 물결 | Gentle waves on a lake / TheFlyFishingFilmmaker | https://freesound.org/s/614299/ |
| crickets.mp3 | 밤 귀뚜라미 | Evening_crickets / adneonlux | https://freesound.org/s/195707/ |
| grass.mp3 | 바람 부는 풀밭 | GRASS IN THE WIND / ciccarelli | https://freesound.org/s/135870/ |
| cave.mp3 | 동굴 물방울 | cave dripping water / mentos987 | https://freesound.org/people/mentos987/sounds/818888/ |
| city.mp3 | 먼 도시 | Night city rumble, quiet distant traffic / TRP | https://freesound.org/s/572530/ |
| writing.mp3 | 연필 사각 | Writing with Pencil on Paper / parkersenk | https://freesound.org/s/444479/ |
| keyboard.mp3 | 키보드 톡톡 | Typing on a keyboard / SamsterBirdies | https://freesound.org/s/489424/ |

asmeul 저장소의 `user-*` 파일(출처·라이선스가 적혀 있지 않음)과 피아노·차임 합성 파일(저장소에 라이선스가 없음)은 쓰지 않았습니다. asmeul의 코드도 가져오지 않았고, 여러 소리를 겹치고 끝을 겹쳐 반복하는 방식만 참고했습니다.

## 직접 합성

- **은은한 피아노**: 오음 음계에서 몇 초마다 한두 음을 사인파 배음으로 치고, 잡음으로 만든 잔향을 입힙니다. 매번 다르게 흘러갑니다.
- **포근한 소음**: 갈색 잡음을 낮게 거른 소리입니다.
