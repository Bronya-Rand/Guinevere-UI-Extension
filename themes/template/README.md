# About `manifest.json`
Starting from Guinevere 2.0, all themes will be required to record all their files and the type of theme under a JSON file.

Important fields to keep in mind are:
- Name: Basically the human friendly name of your theme.
- Version: Version of your theme.
- Type: This specifies the type of theme you are using. This can be either:

    1. "css" - A pure CSS theme.
    2. "html" - A HTML theme only OR a HTML/CSS theme OR HTML/JS
    3. "full" - A whole theme with JS/HTML/CSS. Can also be used for pure JS add-ins.

- Files: This keeps a record of what Guinevere should load to its memory cache for unloading your theme. This is important for cleanup reasons. This doesn't take away your responsibility to make sure your theme cleans up after itself for other themes or to base ST.