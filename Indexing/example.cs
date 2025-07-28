using System; // Required for Console.WriteLine

namespace MyCSharpApp
{
    // A class to contain our program logic
    public class Program
    {
        // Main method: The program execution starts here
        public static void Main(string[] args)
        {
            // Declare and initialize a string variable
            string greeting = "Hello from C#!";

            // Print the greeting to the console
            Console.WriteLine(greeting);

            // Call a custom method
            SayHello("Bob");

            // Keep the console open until a key is pressed (useful for console apps)
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
        }

        // A simple static method that takes a name and prints a personalized message
        public static void SayHello(string name)
        {
            Console.WriteLine($"Nice to meet you, {name}!"); // Using string interpolation
        }
    }
}