Feature: Writing in the browser
  @recovery
  Scenario: A draft survives reloading the app
    Given I have opened the browser writer
    When I create a document containing "A quiet place to think. 🌿"
    And the browser has saved my draft
    And I reload the app
    Then my document contains "A quiet place to think. 🌿"

  @import-export
  Scenario: An imported file can be edited and downloaded
    Given I have opened the browser writer
    When I import a file containing "Original paragraph."
    And I replace its contents with "A revised paragraph."
    And I download a copy
    Then the downloaded file contains "A revised paragraph."

  @offline
  Scenario: Writing continues without a network connection
    Given I have opened the browser writer
    And the app is available offline
    When I disconnect from the network
    And I reload the app
    And I create a document containing "Written while offline."
    And the browser has saved my draft
    And I reload the app
    Then my document contains "Written while offline."

  @recovery
  Scenario: Two named documents retain independent edits through repeated reloads
    Given I have opened the browser writer
    When I import "First.md" containing "First seed."
    And I append " First edit."
    And the browser has saved my draft
    And I import "Second.md" containing "Second seed."
    And I append " Second edit."
    And the browser has saved my draft
    And I reload the app
    And I select document "First.md"
    Then my document contains "First seed. First edit."
    When I select document "Second.md"
    Then my document contains "Second seed. Second edit."
    When I reload the app
    And I select document "First.md"
    Then my document contains "First seed. First edit."
    When I select document "Second.md"
    Then my document contains "Second seed. Second edit."

  @editing
  Scenario: An imported baseline supports undo and redo
    Given I have opened the browser writer
    When I import "History.md" containing "Original."
    And I append " An addition."
    Then my document contains "Original. An addition."
    When I undo the edit
    Then my document contains "Original."
    When I redo the edit
    Then my document contains "Original. An addition."

  @editing
  Scenario: Each document keeps its own undo history while switching
    Given I have opened the browser writer
    When I import "First.md" containing "First."
    And I append " Alpha."
    And I import "Second.md" containing "Second."
    And I append " Beta."
    And I select document "First.md"
    And I undo the edit
    Then my document contains "First."
    When I select document "Second.md"
    Then my document contains "Second. Beta."
    When I undo the edit
    Then my document contains "Second."
    When I select document "First.md"
    And I redo the edit
    Then my document contains "First. Alpha."
    When I select document "Second.md"
    And I redo the edit
    Then my document contains "Second. Beta."

  @editing
  Scenario: A review correction participates in history and survives reload
    Given I have opened the browser writer
    When I import "Review.md" containing "We utilize clear words."
    And I apply the writing correction "use"
    Then my document contains "We use clear words."
    When I undo the edit
    Then my document contains "We utilize clear words."
    When I redo the edit
    Then my document contains "We use clear words."
    When the browser has saved my draft
    And I reload the app
    Then my document contains "We use clear words."

  @import-export
  Scenario: Unicode Markdown survives a renamed download and reimport exactly
    Given I have opened the browser writer
    When I import the Markdown document "Source.md":
      """
      # Café 🌿

      naïve — 東京

      - **Keep** punctuation & symbols.
      - [Link](https://example.test)

      """
    And I name the document "Revised.md"
    And I download a copy
    Then the downloaded "Revised.md" exactly contains:
      """
      # Café 🌿

      naïve — 東京

      - **Keep** punctuation & symbols.
      - [Link](https://example.test)

      """
    When I reimport the downloaded copy
    And I download a copy
    Then the downloaded "Revised.md" exactly contains:
      """
      # Café 🌿

      naïve — 東京

      - **Keep** punctuation & symbols.
      - [Link](https://example.test)

      """

  @import-export
  Scenario: The same file can be imported again after editing
    Given I have opened the browser writer
    When I import "Repeated.md" containing "File baseline."
    And I replace its contents with "Unsaved to the original file."
    And I import "Repeated.md" containing "File baseline."
    Then my document contains "File baseline."
    When I download a copy
    Then the downloaded file contains "File baseline."

  @recovery
  Scenario: Clearing a draft persists the empty document
    Given I have opened the browser writer
    When I import "Empty.md" containing "Remove all of this."
    And I replace its contents with ""
    And the browser has saved my draft
    And I reload the app
    Then my document contains ""
    When I download a copy
    Then the downloaded file contains ""

  @editing
  Scenario: Vim insertion and undo work with a persisted preference
    Given I have opened the browser writer
    When I create a document containing ""
    And I enable "Vim mode"
    And I insert "Vim words." with Vim and leave insert mode with jj
    Then my document contains "Vim words."
    When I undo with Vim
    Then my document contains ""
    When I insert "Persisted Vim." with Vim and leave insert mode with jj
    And the browser has saved my draft
    And I reload the app
    Then "Vim mode" is enabled
    And my document contains "Persisted Vim."

  @editing
  Scenario: Dark mode is the default and can be disabled across reloads
    Given I have opened the browser writer
    Then "Dark mode" is enabled
    When the browser has saved my draft
    And I reload the app
    Then "Dark mode" is enabled
    When I disable "Dark mode"
    And I reload the app
    Then "Dark mode" is disabled

  @editing
  Scenario: Focus mode and sidebar toggles preserve editable content
    Given I have opened the browser writer
    When I import "Focus.md" containing "Stay focused."
    And I enable "Focus mode"
    Then the documents sidebar is hidden
    When I append " More words."
    And I disable "Focus mode"
    Then the documents sidebar is visible
    And my document contains "Stay focused. More words."
    When I toggle the documents sidebar
    Then the documents sidebar is hidden
    When I append " Still here."
    And I toggle the documents sidebar
    Then the documents sidebar is visible
    And my document contains "Stay focused. More words. Still here."

  @editing
  Scenario: Opening optional help does not implicitly download a model
    Given I have opened the browser writer
    When I import "Help.md" containing "Local text."
    And I inspect optional writing help without enabling it
    Then my document contains "Local text. Still writing."

  @recovery
  Scenario: Divergent edits from two tabs are both recovered
    Given I have opened the browser writer
    When I import "Shared.md" containing "Shared seed."
    And the browser has saved my draft
    And another tab opens the saved shared document
    And I replace its contents with "First tab branch."
    And the browser has saved my draft
    And the other tab changes its copy to "Second tab branch."
    Then a fresh tab recovers both "First tab branch." and "Second tab branch."

  @editing
  Scenario: Keyboard selection replaces only selected text and updates the word count
    Given I have opened the browser writer
    When I import "Selection.md" containing "Keep the ending"
    Then the word count is 3
    When I replace the final 6 characters with "new ending" using the keyboard
    Then my document contains "Keep the new ending"
    And the word count is 4
    When I undo the edit
    Then my document contains "Keep the ending"
    And the word count is 3


  @recovery
  Scenario: Multiline keyboard edits and a renamed document survive recovery exactly
    Given I have opened the browser writer
    When I import the Markdown document "Before.md":
      """
      # Café 🌿

      Notes from 東京.
      """
    And I type a new paragraph "A new résumé — finished."
    And I name the document "After.md"
    And the browser has saved my draft
    And I reload the app
    Then my document is named "After.md" and contains:
      """
      # Café 🌿

      Notes from 東京.

      A new résumé — finished.
      """
    When I download a copy
    Then the downloaded "After.md" exactly contains:
      """
      # Café 🌿

      Notes from 東京.

      A new résumé — finished.
      """
