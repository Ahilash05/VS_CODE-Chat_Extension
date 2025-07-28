#include <stdio.h> // Standard input/output library for printf

// Function declaration (prototype)
int addTwoNumbers(int a, int b);

// Main function: The program execution starts here
int main() {
    int num1 = 10;
    int num2 = 25;
    int sum;

    // Call the addTwoNumbers function
    sum = addTwoNumbers(num1, num2);

    // Print the result to the console
    printf("The sum of %d and %d is %d.\n", num1, num2, sum);
    printf("Hello from C!\n"); // Another simple print

    return 0; // Indicate successful execution
}

// Function definition
int add(int a, int b) {
    return a + b;
}
