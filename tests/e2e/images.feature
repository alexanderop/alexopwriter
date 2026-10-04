Feature: Portable pasted images
  Scenario: An image survives browser recovery and a downloaded document
    Given I open an empty image writing workspace
    When I paste a copied image into my document
    Then the pasted image is displayed and saved in browser recovery
    When I reload the image writing workspace
    Then the recovered image is displayed
    When I download and reimport the illustrated document
    Then the imported image has the original bytes
