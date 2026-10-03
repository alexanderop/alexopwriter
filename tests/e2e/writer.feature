Feature: Writing in the browser
  Scenario: A draft survives reloading the app
    Given I have opened the browser writer
    When I create a document containing "A quiet place to think. 🌿"
    And the browser has saved my draft
    And I reload the app
    Then my document contains "A quiet place to think. 🌿"

  Scenario: An imported file can be edited and downloaded
    Given I have opened the browser writer
    When I import a file containing "Original paragraph."
    And I replace its contents with "A revised paragraph."
    And I download a copy
    Then the downloaded file contains "A revised paragraph."

  Scenario: Writing continues without a network connection
    Given I have opened the browser writer
    And the app is available offline
    When I disconnect from the network
    And I reload the app
    And I create a document containing "Written while offline."
    And the browser has saved my draft
    And I reload the app
    Then my document contains "Written while offline."
