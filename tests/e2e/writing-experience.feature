Feature: A focused browser writing experience
  @editing
  Scenario: New writers can type without enabling a mode
    Given I open the writer for the first time
    Then "Vim mode" is disabled
    When I append "Ready to write."
    Then my document contains "Ready to write."

  @editing
  Scenario: Find and replace changes matching words in one undoable edit
    Given I have opened the browser writer
    When I import "Search.md" containing "Quiet words. Quiet room."
    And I replace all "Quiet" with "Clear" using Find
    Then my document contains "Clear words. Clear room."
    When I undo the edit
    Then my document contains "Quiet words. Quiet room."

  @editing
  Scenario: Writing preferences survive reload
    Given I have opened the browser writer
    When I customize typography, focus, and spelling
    And I reload the app
    Then my writing preferences are retained

  @recovery
  Scenario: A favorite document keeps its folder after trash and restore
    Given I have opened the browser writer
    When I import "Organized.md" containing "A recoverable draft."
    And I favorite the document in folder "Essays"
    And I move the document to Trash and restore it
    And the browser has saved my draft
    And I reload the app
    And I select document "Organized.md"
    Then it is a favorite in folder "Essays"
    And my document contains "A recoverable draft."

  @import-export @offline
  Scenario: Preview and formatted downloads work offline without losing undo
    Given I have opened the browser writer
    And the app is available offline
    When I import the Markdown document "Essay.md":
      """
      # An essay

      A **bold** thought.
      """
    And I append " More."
    And I disconnect from the network
    And I read the preview and return to writing
    And I undo the edit
    Then my document contains:
      """
      # An essay

      A **bold** thought.
      """
    When I download the formatted HTML and Word documents

  @editing
  Scenario: Quick navigation selects a heading without changing the rest of the draft
    Given I have opened the browser writer
    When I import the Markdown document "Headings.md":
      """
      # First section

      Keep this paragraph.

      ## Second section

      Keep the ending.
      """
    And I navigate to the second heading and replace its selection
    Then my document contains "Keep this paragraph." somewhere
    And my document contains "Replacement heading" somewhere
    And my document contains "Keep the ending." somewhere
