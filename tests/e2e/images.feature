@images
Feature: Portable pasted images
  Scenario: An image survives browser recovery and a downloaded document
    Given I open an empty image writing workspace
    When I paste a copied image into my document
    Then the pasted image is displayed and saved in browser recovery
    When I reload the image writing workspace
    Then the recovered image is displayed
    When I download and reimport the illustrated document
    Then the imported image has the original bytes

  Scenario: Manual alt text is portable and never downloads a model
    Given I open an empty image writing workspace
    When I paste a copied image into my document
    And I describe the image manually
    And I reload the image writing workspace
    Then my image description is recovered and included in the download
