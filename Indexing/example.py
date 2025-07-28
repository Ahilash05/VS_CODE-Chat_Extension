# A simple Python file
    def greet(name):
        print(f"Hello, {name}!")

    class Animal:
        def _init_(self, species):
            self.species = species

        def make_sound(self):
            raise NotImplementedError("Subclass must implement abstract method")

    class Dog(Animal):
        def _init_(self, name):
            super()._init_("dog")
            self.name = name
        def bark(self):
            print(f"{self.name} says Woof!")

    greet("Pythonista")
    my_dog = Dog("Buddy")
    my_dog.bark()

 